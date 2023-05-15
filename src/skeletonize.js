import { TreeNodeTypes } from "./tree-parse.js";
import { toImplement, assert } from "./util.js";
import { TokenTypes } from "./tokenize.js";

// to C

export class CSkeletonizer {
    static CTypeMap = {
        "Int": "int",
        "Byte": "uint8_t",
        "Void": "void",
    };

    static MAX_TEMPORARY_COUNT = 10;

    constructor(treeNodes, indentCount = 4) {
        this.treeNodes = treeNodes;
        this.typeInfo = {};
        this.defineInfo = {};
        this.codeLines = [];
        this.includeLines = [
            "#include <stdint.h>",
        ]
        this.headerLines = [];
        this.emitLevel = 0;
        this.indentCount = indentCount;
        this.temporaries = {};
        for(let i = 0; i < CSkeletonizer.MAX_TEMPORARY_COUNT; i++) {
            this.temporaries[`_temp_${i}`] = false;
        }
    }

    getTemporary() {
        for(let i = 0; i < CSkeletonizer.MAX_TEMPORARY_COUNT; i++) {
            let name = `_temp_${i}`;
            if(!this.temporaries[name]) {
                this.temporaries[name] = true;
                return name;
            }
        }
        assert(null, "No more temporaries available");
    }

    releaseTemporary(name) {
        this.temporaries[name] = false;
    }

    emitGroupStart() {
        this.emitLevel += this.indentCount;
    }

    emitGroupEnd() {
        assert(this.emitLevel >= this.indentCount, "No open group to end");
        this.emitLevel -= this.indentCount;
    }

    emit(line) {
        let indentation = " ".repeat(this.emitLevel);
        this.codeLines.push(indentation + line);
    }

    skeletonize() {
        for(let node of this.treeNodes) {
            this.skeletonizeNode(node);
        }
    }

    inferType(token) {
        if(token.type === TokenTypes.Number) {
            return CSkeletonizer.CTypeMap["Int"];
        }
        // TODO: local scope
        else if(token.type === TokenTypes.Word) {
            let typeInfo = this.typeInfo[token.raw];
            assert(typeInfo, `I have no context on what ${token.dump()} is`);
        }
        else {
            assert(null, `Cannot infer the type of ${token.dump()}`);
        }
    } 

    skeletonizeNode(node, level = 0) {
        if(node.type === TreeNodeTypes.Comment) {
            /*
            // TODO: make mesh well with other comment types
            let { comment } = node.value;
            if(comment.startsWith("///")) {
                this.emit(`// ${comment.slice(3).trimLeft()}`);
            }
            */
        }
        else if(node.type === TreeNodeTypes.Declaration) {
            let { type, declared, mutable } = node.value;
            // console.log("VARIABLE", type,declared,mutable);
            let cType = CSkeletonizer.CTypeMap[type];
            let variables = declared.map(token => token.raw);
            // TODO: array type
            for(let v of variables) {
                this.typeInfo[v] =  { cType, mutable };
            }
        }
        else if(node.type === TreeNodeTypes.Assignment) {
            // assuming immutable for now
            let { variable, expression } = node.value;
            let cExpression = expression
                .map(token => token.raw)
                .join(" ");
            let { cType, mutable } = this.typeInfo[variable];
            // console.log(node.value.expression);
            if(mutable) {
                this.emit(`${variable} = ${cExpression};`);
            }
            else {
                this.emit(`#define ${variable} ((${cType}) ${cExpression})`);
            }
        }
        else if(node.type === TreeNodeTypes.Structure) {
            // TODO: allow for more complicated structures
            assert(node.children.length === 1,
                "Complex structures currently unimplemented");
            let { name } = node.value;
            let [ child ] = node.children;
            assert(child.type === TreeNodeTypes.Declaration,
                "Structure must have a variable declaration");
            let data = child.value;
            if(data.type === "Array") {
                let subType = CSkeletonizer.CTypeMap[data.declared[0].raw]; 
                let dimensions = data.declared
                    .slice(1)
                    .map(token => `[${token.raw}]`)
                    .join("");
                this.emit(`typedef ${subType} ${name}${dimensions};`);
            }
            else {
                toImplement("Other structure datatypes besides array");
            }
        }
        else if(node.type === TreeNodeTypes.MethodDeclaration) {
            let { name, parameters, returnType } = node.value;
            returnType ||= "Void";
            returnType = CSkeletonizer.CTypeMap[returnType];
            // TODO: return types
            assert(parameters.length % 2 === 0, "Expected a list of type-name pairs");
            let typedParameters = [];
            for(let i = 0; i < parameters.length; i += 2) {
                let cType = CSkeletonizer.CTypeMap[parameters[i].raw];
                let paramName = parameters[i + 1].raw;
                typedParameters.push(`${cType} ${paramName}`);
            }
            // coaelesce empty arguments to the more proper ...fn(void) syntax
            let paramSignature = typedParameters.join(", ") || "void";
            this.headerLines.push(`void ${name}(${paramSignature});`);
            this.emit(`${returnType} ${name} (${paramSignature}) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else if(node.type === TreeNodeTypes.MethodCall) {
            assert(level > 0, "Cannot call method at top level");
            // console.log(node);
            let { method, parameters } = node.value;
            let methodName = method.raw;
            let joinedParameters = parameters
                .map(token => token.raw)
                .join(", ");
            // // infer type
            // let inferredType = parameters.map(token => this.inferType(token));
            // console.log("INFERRED", inferredType);
            this.emit(`${methodName}(${joinedParameters});`);
        }
        else if(node.type === TreeNodeTypes.Pass) {
            // NOTE: the TODO comment is actually supposed to be emitted here
            this.emit("//TODO:");
        }
        else if(node.type === TreeNodeTypes.DefaultDefine) {
            let { name, default: defaultValue } = node.value;
            this.assertValidDefine(name, defaultValue);

            let defineInfo = this.defineInfo[name];
            let macroName = name + "_" + defaultValue;
            let condition = defineInfo.options
                .map(option => `!defined(${name}_${option})`)
                .join(" && ");
            this.headerLines.push(`#if ${condition}`);
            this.headerLines.push(`  #define ${macroName}`);
            this.headerLines.push("#endif");
        }
        else if(node.type === TreeNodeTypes.Define) {
            let { name, value } = node.value;
            this.assertValidDefine(name, value);

            let defineInfo = this.defineInfo[name];
            let macroName = name + "_" + value;
            let current = defineInfo.current;
            if(current) {
                this.headerLines.push(`#undef ${current}`);
            }
            this.headerLines.push(`#define ${macroName}`);
            defineInfo.current = macroName;

        }
        else if(node.type === TreeNodeTypes.SetMode) {
            let { name, modes } = node.value;
            let options = modes.map(token => token.raw);
            // TODO: non mutually exclusive modes?
            this.defineInfo[name] = {
                current: null,
                options,
            };
            let fullOptions = options
                .map(option => `${name}_${option}`)
                .join(" | ");
            this.headerLines.push(`/** ${name}: ${fullOptions} **/`);
        }
        else if(node.type === TreeNodeTypes.Repeat) {
            //TODO: pretty print expression
            // (e.g. `(3+4)` => `(3 + 4)` instead of `( 3 + 4 )`)
            let conditionExpression = node.value.condition
                .filter(token => token.type !== TokenTypes.Spaces)
                .map(token => token.raw)
                .join(" ");
            let temp = this.getTemporary();
            this.emit(`for(int ${temp} = 0; ${temp} < ${conditionExpression}; ${temp}++) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else {
            toImplement(`${node.type.toString()}`);
        }
    }

    assertValidDefine(name, value) {
        let defineInfo = this.defineInfo[name];
        assert(defineInfo, `Undefined mode ${value}. Did you forget a SETMODE?`);
        assert(defineInfo.options.includes(value),
            `${value} is not a valid mode for ${name}. Valid options include: ${defineInfo.options.join(" | ")}`);
    }
}

export const skeletonize = (treeNodes) => {
    let skeletonizer = new CSkeletonizer(treeNodes);
    skeletonizer.skeletonize();
    return [
        ...skeletonizer.includeLines,
        "",
        ...skeletonizer.headerLines,
        "",
        ...skeletonizer.codeLines,
    ].join("\n");
};
