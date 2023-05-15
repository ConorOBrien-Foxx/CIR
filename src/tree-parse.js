import { Token, TokenTypes } from "./tokenize.js";
import { assert, toImplement, warn } from "./util.js";

export const WordTypes = {
    Type: Symbol("WordTypes.Type"),
    Method: Symbol("WordTypes.Method"),
};

export const TreeNodeTypes = {
    Declaration: Symbol("TreeNodeTypes.Declaration"),
    Assignment: Symbol("TreeNodeTypes.Assignment"),
    Structure: Symbol("TreeNodeTypes.Structure"),
    MethodDeclaration: Symbol("TreeNodeTypes.MethodDeclaration"),
    MethodCall: Symbol("TreeNodeTypes.MethodCall"),
    Pass: Symbol("TreeNodeTypes.Pass"),
    Comment: Symbol("TreeNodeTypes.Comment"),
    DefaultDefine: Symbol("TreeNodeTypes.DefaultDefine"),
    Define: Symbol("TreeNodeTypes.Define"),
    SetMode: Symbol("TreeNodeTypes.SetMode"),
    Repeat: Symbol("TreeNodeTypes.Repeat"),
};

class TreeNode {
    constructor(type, value, children = []) {
        this.type = type;
        this.value = value;
        this.children = children;
    }
    
    addChild(child) {
        this.children.push(child);
    }
}

export class TreeParser {
    constructor(tokens) {
        this.tokenIndex = 0;
        this.tokens = tokens;
        this.indent = {
            level: 0,
            delta: 0,
        };
        this.typeContext = {
            Int: WordTypes.Type,
            Byte: WordTypes.Type,
            Array: WordTypes.Type,
        };
        this.variableTypes = {};
        this.matched = null;
        this.nodes = [];
    }
    
    getTokenOffset(i) {
        return this.tokens[this.tokenIndex + i];
    }
    
    getTokenOffsetNoSpaces(i) {
        let result, j = i;
        do {
            result = this.tokens[this.tokenIndex + j];
            j++;
        }
        while(result.type === TokenTypes.Spaces);
        return result;
    }

    addNode(node) {
        this.nodes.push(node);
    }
    
    addNewNode(...args) {
        this.addNode(new TreeNode(...args));
    }
    
    hasTokensLeft() {
        return this.tokenIndex < this.tokens.length;
    }
    
    hasAhead(option) {
        if(!this.hasTokensLeft()) {
            return false;
        }
        if(this.getTokenOffset(0).type === option) {
            this.matched = { size: 1 };
            return true;
        }
        return false;
    }
    
    hasSequenceAhead(toMatch, ignoreSpaces = true) {
        if(toMatch.length + this.tokenIndex >= this.tokens.length) {
            return false;
        }
        
        let j = 0;
        for(let i = 0; i < toMatch.length && this.tokenIndex + j < this.tokens.length; i++, j++) {
            // skip spaces within matched expression
            while(ignoreSpaces && this.getTokenOffset(j).type === TokenTypes.Spaces) {
                j++;
            }
            if(this.getTokenOffset(j).type !== toMatch[i]) {
                return false;
            }
        }
        // skip spaces after matched expression
        while(ignoreSpaces && this.getTokenOffset(j).type === TokenTypes.Spaces) {
            j++;
        }
        
        // console.log("Matched", j, this.tokens.slice(this.tokenIndex, this.tokenIndex + j));
        this.matched = { size: j };
        return true;
    }
    
    hasOptionAhead(options) {
        for(let option of options) {
            if(this.hasAhead(option)) {
                return true;
            }
        }
        return false;
    }
    
    skipMatched() {
        this.tokenIndex += this.matched.size;
    }
    
    parse(minLevel = 0) {
        while(this.hasTokensLeft()) {
            let beforeIndex = this.tokenIndex;
            let substepDone = this.parseStep(minLevel);
            assert(substepDone || beforeIndex < this.tokenIndex,
                "parseStep() should be strictly increasing token index");
            if(substepDone) {
                break;
            }
        }
        
        return this.nodes;
    }
    
    parseInitialWhitespace() {
        let oldIndex = this.tokenIndex;
        // console.log("~ parsing initial whitespace");
        let spaceLevel, spaceCount;
        if(this.hasAhead(TokenTypes.Spaces)) {
            let spaces = this.getTokenOffset(0).raw;
            spaceCount = spaces.length;
            if(this.indent.level === 0) {
                spaceLevel = 1;
                this.indent.delta = spaceCount;
            }
            else {
                assert(spaceCount % this.indent.delta === 0,
                    `Improper indentation: Expected a multiple of ${this.indent.delta} space(s).`);
                spaceLevel = spaceCount / this.indent.delta;
            }
            this.tokenIndex++;
        }
        else {
            // console.log("DID NOT HAVE SPACES AHEAD WHILE LOOKING AT INITIAL WHITESPACE");
            // console.log(this.getTokenOffset(0));
            spaceLevel = spaceCount = 0;
        }
        
        let previous = this.indent.level;
        this.indent.level = spaceLevel;
        // console.table({ previous, next: spaceLevel, spaceLevel, spaceCount });
        return { previous, next: spaceLevel, oldIndex: oldIndex };
    }
    
    /**
     * Returns `true` if the step indicates parsing at the level is done, `false` otherwise.
     */
    parseStep(minLevel = 0) {
        // console.log("-- parse once --");
        // console.log(`[BEFORE RECALC] Current level: ${this.indent.level}, Minimum level: ${minLevel}`);
        // skip line breaks
        while(this.hasAhead(TokenTypes.LineBreak)) {
            this.parseLineBreak();
        }
        
        if(!this.hasTokensLeft()) {
            return true;
        }
        
        let oldIndent = Object.assign({}, this.indent);
        let { oldIndex } = this.parseInitialWhitespace();
        
        // console.log(`[BEFORE COMPARE] Current level: ${this.indent.level}, Minimum level: ${minLevel}`);
        // console.log();
        if(!this.hasTokensLeft()) {
            return true;
        }
        if(this.indent.level < minLevel) {
            // rollback to previous whitespace state
            Object.assign(this.indent, oldIndent);
            this.tokenIndex = oldIndex;
            return true;
        }
        
        if(this.hasAhead(TokenTypes.Comment)) {
            this.parseComment();
        }
        else if(this.hasAhead(TokenTypes.Keyword)) {
            let keyword = this.getTokenOffset(0).raw;
            if(keyword !== keyword.toUpperCase()) {
                keyword = keyword.toUpperCase();
                warn(`Keywords should be in all UPPERCASE, like '${keyword}'. If you meant something else, do not use a keyword here.`);
            }
            if(keyword === "STRUCTURE") {
                this.parseStructure();
            }
            else if(keyword === "METHOD") {
                this.parseMethodDeclaration();
            }
            else if(keyword === "PASS") {
                this.parsePass();
            }
            else if(keyword === "DEFAULT") {
                this.parseDefault();
            }
            else if(keyword === "DEFINE") {
                this.parseDefine();
            }
            else if(keyword === "SETMODE") {
                this.parseSetMode();
            }
            else if(keyword === "MUTABLE") {
                this.parseMutable();
            }
            else if(keyword === "REPEAT") {
                this.parseRepeat();
            }
            else {
                assert(null, `Unhandled keyword: ${keyword}`);
            }
        }
        else {
            let succeeded = this.parseHeadExpression();
            assert(succeeded, `Unhandled token: ${this.getTokenOffset(0)?.dump()}`);
        }
        
        return false;
    }

    parseRepeat() {
        console.log("> parsing repeat");
        this.tokenIndex++;
        let countExpression = [];
        while(this.hasTokensLeft() && !this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Colon ])) {
            countExpression.push(this.getTokenOffset(0));
            this.tokenIndex++;
        }
        assert(this.hasTokensLeft(), "Runaway REPEAT loop");
        assert(this.findTokenFromOffset(0, TokenTypes.Keyword).raw === "TIMES",
            "Expected TIMES before Colon");
        this.skipMatched();
        let baseLevel = this.indent.level;
        let children = this.descendParse(baseLevel);
        this.addNewNode(TreeNodeTypes.Repeat, { condition: countExpression }, children);
    }

    parseSetMode() {
        assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.OpenParen ]),
            "Malformed SETMODE command");
        let name = this.findTokenFromOffset(1, TokenTypes.Word).raw;
        this.skipMatched();
        let modes = this.parseParameterized();
        this.addNewNode(TreeNodeTypes.SetMode, { name, modes });
    }

    parseDefault() {
        let [ defineName, defaultValue ] = this.parseKeywordEquals("DEFAULT");
        this.addNewNode(TreeNodeTypes.DefaultDefine, { name: defineName, default: defaultValue });
    }

    parseDefine() {
        let [ defineName, value ] = this.parseKeywordEquals("DEFINE");
        this.addNewNode(TreeNodeTypes.Define, { name: defineName, value: value });
    }

    parseKeywordEquals(name) {
        assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.SetEquals ]),
            `Malformed ${name} command`);
        let keyName = this.findTokenFromOffset(1, TokenTypes.Word).raw;
        this.skipMatched();

        let valueName = this.getTokenOffset(0).raw;
        this.tokenIndex++;

        return [ keyName, valueName ];
    }

    parseComment() {
        this.addNewNode(TreeNodeTypes.Comment, { comment: this.getTokenOffset(0).raw });
        this.tokenIndex++;
    }
    
    parseMutable() {
        // TODO: static type validation
        assert(this.hasSequenceAhead([ TokenTypes.Keyword ]));
        this.skipMatched();
        assert(this.parseHeadExpression(), "Declaration must follow MUTABLE");
        let declaration = this.nodes.at(-1);
        assert(declaration.type === TreeNodeTypes.Declaration, "Declaration must follow MUTABLE");
        declaration.value.mutable = true;
    }

    // returns true if was able to parse expression, false otherwise
    parseHeadExpression() {
        // console.log("> parse expression");
        // call or definition
        if(this.hasSequenceAhead([ TokenTypes.Word, TokenTypes.OpenParen ])) {
            let word = this.getTokenOffset(0);
            let wordType = this.typeContext[word.raw];
            this.skipMatched();
            if(wordType === WordTypes.Type) {
                this.parseTypeDeclaration(word);
            }
            else {
                this.parseMethodEvaluation(word);
            }
        }
        // assignment
        else if(this.hasSequenceAhead([ TokenTypes.Word, TokenTypes.SetEquals ])) {
            // TODO: only allow repeat assignment for volatile tags
            let word = this.getTokenOffset(0);
            this.skipMatched();
            this.parseAssignmentExpression(word);
        }
        else {
            return false;
        }
        return true;
    }

    findTokenFromOffset(offset, type) {
        return this.tokens
            .slice(this.tokenIndex + offset)
            .find(token => token.type === type);
    }
    
    parseStructure() {
        // console.log("> parsing structure");
        assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.Colon ]),
            "Malformed STRUCTURE command");
        
        let structureName = this.findTokenFromOffset(1, TokenTypes.Word).raw;
        this.skipMatched();
        
        assert(this.hasAhead(TokenTypes.LineBreak), "Expected line break after STRUCTURE command");
        this.tokenIndex++;
        
        // console.log(this.tokens.slice(this.tokenIndex, this.tokenIndex + 3));
        // parse body
        let info = this.parseInitialWhitespace();
        let baseLevel = info.previous;
        let indentedLevel = info.next;
        
        // console.log("WHITESPACE INFO", info);
        // TODO: multiple lines
        this.parseStep();//TODO: replace with call to special method?
        let node = this.nodes.pop();
        
        this.addNewNode(TreeNodeTypes.Structure, {
            name: structureName
        }, [ node ]);
    }
    
    parseMethodDeclaration() {
        console.log("> parsing method");
        let parameters = [];
        let returnType = null;
        let hasParameters = false;
        if(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.OpenParen ])) {
            hasParameters = true;
        }
        else {
            assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word ]),
                "Malformed METHOD command");
        }
        let methodName = this.findTokenFromOffset(1, TokenTypes.Word).raw;
        this.skipMatched();
        // procure paramters if relevant
        if(hasParameters) {
            parameters = this.parseParameterized();
        }
        if(this.hasAhead(TokenTypes.ReturnTypeIndicator)) {
            assert(this.hasSequenceAhead([ TokenTypes.ReturnTypeIndicator, TokenTypes.Word ]),
                "Malformed return type indicator");
            returnType = this.getTokenOffsetNoSpaces(1).raw;
            this.skipMatched();
        }
        // console.log(this.tokens.slice(this.tokenIndex).map(c=>c.raw));
        assert(this.hasAhead(TokenTypes.Colon), "Expected colon following METHOD argument list");
        this.tokenIndex++;
        // assert at main level
        let baseLevel = this.indent.level;
        assert(this.indent.level === 0,
            "Can only have method declarations at base level");
        
        // obtain representation for children
        let children = this.descendParse(baseLevel);

        this.addNewNode(TreeNodeTypes.MethodDeclaration, {
            name: methodName,
            parameters,
            returnType,
        }, children);
    }

    descendParse(baseLevel) {
        console.log(">>> going deeper", baseLevel, "->", baseLevel + 1);
        let nodeLength = this.nodes.length;
        console.group();
        this.parse(baseLevel + 1);
        console.groupEnd();
        let children = this.nodes.splice(nodeLength);
        return children;
    }
    
    parsePass() {
        this.tokenIndex++;
        this.addNewNode(TreeNodeTypes.Pass);
    }
    
    parseLineBreak() {
        // console.log("> skipping line break");
        this.tokenIndex++;
    }
    
    parseAssignmentExpression(word) {
        // console.log("> assignment");
        let variableName = word.raw;
        let expression = [];
        while(this.hasTokensLeft()) {
            let token = this.getTokenOffset(0);
            if(token.type === TokenTypes.LineBreak) {
                break;
            }
            expression.push(token);
            this.tokenIndex++;
        }
        this.addNewNode(TreeNodeTypes.Assignment, { variable: variableName, expression });
    }
    
    parseTypeDeclaration(word) {
        // console.log("> parse type decl");
        let declared = this.parseParameterized();
        let type = word.raw;
        assert(declared.length > 0, `Expected 1 or more variables for ${type} variable declaration.`);
        if(type === "Array") {
            // parameterized declaration
        }
        else {
            // declare multiple as same type
            for(let { raw } of declared) {
                this.variableTypes[raw] = type;
            }
        }
        this.addNewNode(TreeNodeTypes.Declaration, { type, declared, mutable: false });
    }
    
    parseMethodEvaluation(word) {
        // console.log("> parse method eval");
        let parameters = this.parseParameterized();
        this.addNewNode(TreeNodeTypes.MethodCall, { method: word, parameters });
    }
    
    parseParameterized() {
        let declared = [];
        while(!this.hasAhead(TokenTypes.CloseParen)) {
            assert(this.hasTokensLeft(), "Runaway variable declaration for ${type}");
            if(this.hasOptionAhead([ TokenTypes.Word, TokenTypes.Number ])) {
                declared.push(this.getTokenOffset(0));
                this.tokenIndex++;
            }
            // TODO: assert ("comma" + "space"?) repeated?
            else if(this.hasOptionAhead([ TokenTypes.Comma, TokenTypes.Spaces ])) {
                this.tokenIndex++;
            }
            else {
                assert(null, `Unexpected token: ${this.getTokenOffset(0).dump()}`);
            }
        }
        this.tokenIndex++; // skip `)`
        return declared;
    }
}

export const makeTree = (tokens) => {
    let parser = new TreeParser(tokens);
    try {
        return parser.parse();
    }
    catch(e) {
        console.log("XXX-- ERROR ENCOUNTERED --XXX");
        console.log("Remaining tokens:");
        console.group();
        for(let token of parser.tokens.slice(parser.tokenIndex)) {
            console.log(token.dump());
        }
        console.groupEnd();
        console.log("Dumping nodes:");
        console.group();
        for(let node of parser.nodes) {
            console.log(node);
        }
        console.groupEnd();
        throw e;
    }
};
