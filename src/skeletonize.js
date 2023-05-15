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
            "#define true (1)",
            "#define false (0)",
        ]
        this.headerLines = [];
        this.emitLevel = 0;
        this.indentCount = indentCount;
        this.temporaries = {};
        for(let i = 0; i < CSkeletonizer.MAX_TEMPORARY_COUNT; i++) {
            this.temporaries[`_temp_${i}`] = false;
        }
        this.typeMap = Object.assign({}, CSkeletonizer.CTypeMap);
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
            return this.typeMap["Int"];
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

    getCExpression(expression) {
        return expression
            .map(token =>
                token.raw === "and"
                    ? "&&"
                    : token.raw === "or"
                        ? "||"
                        : token.raw === "is"
                            ? "=="
                            : token.raw)
            .join("")
            .trim();
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
            let cType = this.typeMap[type] ?? type;
            let variables = declared.map(token => token.raw);
            // TODO: array type
            for(let v of variables) {
                this.typeInfo[v] =  { cType, mutable };
            }
            this.emit(`${cType} ${variables.join(", ")};`);
        }
        else if(node.type === TreeNodeTypes.Assignment) {
            // assuming immutable for now
            let { variable, expression } = node.value;
            let cExpression = this.getCExpression(expression);
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
            console.log(child);
            this.typeMap[name] = name;
            if(child.type === TreeNodeTypes.Pass || child.type === TreeNodeTypes.Todo) {
                this.emit(`typedef /* TODO: FILL */ ${name};`);
            }
            else {
                assert(child.type === TreeNodeTypes.Declaration,
                    "Structure must have a variable declaration");
                let data = child.value;
                if(data.type === "Array") {
                    let subType = this.typeMap[data.declared[0].raw];
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
        }
        else if(node.type === TreeNodeTypes.MethodDeclaration) {
            let { name, parameters, returnType } = node.value;
            returnType ||= "Void";
            returnType = this.typeMap[returnType];
            console.log(parameters);
            let parsedParameters = [];
            for(let i = 0; i < parameters.length; i++) {
                if(parameters[i].raw === "Array") {
                    assert(parameters[i + 1].raw === "[");
                    let j = parameters.findIndex((c, idx) => c.raw === "]" && idx > i);
                    let dims = parameters.slice(i + 2, j).map(e => e.raw);
                    let base = dims.shift();
                    parsedParameters.push([base, dims.map(c => `[${c}]`).join("")]);
                    i = j;
                }
                else {
                    parsedParameters.push(parameters[i].raw);
                }
            }
            assert(parsedParameters.length % 2 === 0, "Expected a list of type-name pairs");
            let typedParameters = [];
            for(let i = 0; i < parsedParameters.length; i += 2) {
                let cType = parsedParameters[i];
                cType = this.typeMap[cType] ?? cType;
                let paramName = parsedParameters[i + 1];
                if(Array.isArray(cType)) {
                    let [ prefix, suffix ] = cType;
                    prefix = this.typeMap[prefix] ?? prefix;
                    typedParameters.push(`${prefix} ${paramName}${suffix}`);
                }
                else {
                    typedParameters.push(`${cType} ${paramName}`);
                }
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
        else if(node.type === TreeNodeTypes.If) {
            let { condition } = node.value;
            let cExpression = this.getCExpression(condition);
            this.emit(`if (${cExpression}) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else if(node.type === TreeNodeTypes.While) {
            let { condition } = node.value;
            let cExpression = this.getCExpression(condition);
            this.emit(`while (${cExpression}) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else if(node.type === TreeNodeTypes.Choose) {
            let modeName = node.value.name;
            for(let option of node.children) {
                let optionWord = option.value.option.find(c => c.type === TokenTypes.Word);
                console.log(option.children);
                this.emit(`#ifdef ${modeName}_${optionWord.raw}`);
                this.emitGroupStart();
                for(let child of option.children) {
                    this.skeletonizeNode(child, level + 1);
                }
                this.emitGroupEnd();
                this.emit(`#endif`);
            }
        }
        else if(node.type === TreeNodeTypes.For) {
            let cStart = this.getCExpression(node.value.from);
            let iterator = node.value.from.find(c => c.type === TokenTypes.Word).raw;
            let cEnd = this.getCExpression(node.value.to);
            this.emit(`for(int ${cStart}; ${iterator} <= ${cEnd}; ${iterator}++) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit(`}`);
        }
        else if(node.type === TreeNodeTypes.ElseIf) {
            let { condition } = node.value;
            let cExpression = this.getCExpression(condition);
            this.emit(`else if (${cExpression}) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else if(node.type === TreeNodeTypes.Else) {
            this.emit(`else {`);
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
            let joinedParameters = this.getCExpression(parameters);
            /*parameters
                .map(token => token.raw)
                .join(" ");*/
            // // infer type
            // let inferredType = parameters.map(token => this.inferType(token));
            // console.log("INFERRED", inferredType);
            this.emit(`${methodName}(${joinedParameters});`);
        }
        else if(node.type === TreeNodeTypes.Pass || node.type === TreeNodeTypes.Todo) {
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
            console.log(node.value);
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
        else if(node.type === TreeNodeTypes.Return) {
            let cExpression = this.getCExpression(node.value.expression);
            this.emit(`return ${cExpression};`);
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
