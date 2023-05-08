import { TreeNodeTypes } from "./tree-parse.js";
import { toImplement, assert } from "./util.js";

// to C

export class CSkeletonizer {
    static CTypeMap = {
        "Int": "int",
        "Byte": "uint8_t",
    };

    constructor(treeNodes, indentCount = 4) {
        this.treeNodes = treeNodes;
        this.typeInfo = {};
        this.codeLines = [];
        this.headerLines = [
            "#include <stdint.h>",
        ];
        this.emitLevel = 0;
        this.indentCount = indentCount;
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

    skeletonizeNode(node, level = 0) {
        if(node.type === TreeNodeTypes.Comment) {
            return;
        }
        else if(node.type === TreeNodeTypes.Declaration) {
            let cType = CSkeletonizer.CTypeMap[node.value.type];
            let variables = node.value.declared.map(token => token.raw);
            // TODO: array type
            for(let v of variables) {
                this.typeInfo[v] = cType;
            }
        }
        else if(node.type === TreeNodeTypes.Assignment) {
            // assuming immutable for now
            let { variable, expression } = node.value;
            let cExpression = expression
                .map(token => token.raw)
                .join(" ");
            let cType = this.typeInfo[variable];
            // console.log(node.value.expression);
            this.emit(`#define ${variable} ((${cType}) ${cExpression})`);
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
            let { name } = node.value;
            // TODO: more than void-void calls
            this.headerLines.push(`void ${name}(void);`)
            this.emit(`void ${name} (void) {`);
            this.emitGroupStart();
            for(let child of node.children) {
                this.skeletonizeNode(child, level + 1);
            }
            this.emitGroupEnd();
            this.emit("}");
        }
        else if(node.type === TreeNodeTypes.MethodCall) {
            assert(level > 0, "Cannot call method at top level");
            console.log(node);
            let { method, parameters } = node.value;
            let methodName = method.raw;
            let joinedParameters = parameters
                .map(token => token.raw)
                .join(", ");
            this.emit(`${methodName}(${joinedParameters});`);
        }
        else if(node.type === TreeNodeTypes.Pass) {
            // NOTE: the TODO comment is actually supposed to be emitted here
            this.emit("//TODO:");
        }
        else {
            toImplement(`${node.type.toString()}`);
        }
    }
}

export const skeletonize = (treeNodes) => {
    let skeletonizer = new CSkeletonizer(treeNodes);
    skeletonizer.skeletonize();
    return [
        ...skeletonizer.headerLines,
        "",
        ...skeletonizer.codeLines,
    ].join("\n");
};
