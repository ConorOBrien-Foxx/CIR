const fs = require("fs");

class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = "AssertionError";
    }
}

const assert = (expression, message="Assertion failed") => {
    if(!expression) {
        throw new AssertionError(message);
    }
};

const toImplement = (message) => assert(null, "TODO: IMPLEMENT `" + message + "`");

const warn = (message) => {
    console.warn(message);
    // TODO: warns as errors
};

const TokenTypes = {
    Word: Symbol("TokenTypes.Word"),
    Colon: Symbol("TokenTypes.Colon"),
    LineBreak: Symbol("TokenTypes.LineBreak"),
    Spaces: Symbol("TokenTypes.Spaces"),
    OpenParen: Symbol("TokenTypes.OpenParen"),
    CloseParen: Symbol("TokenTypes.CloseParen"),
    Comma: Symbol("TokenTypes.Comma"),
    SetEquals: Symbol("TokenTypes.SetEquals"),
    Keyword: Symbol("TokenTypes.Keyword"),
    Number: Symbol("TokenTypes.Number"),
};

const TokenRegexes = [
    [ /^(?:STRUCTURE|METHOD|PASS|REPEAT)\b/i, TokenTypes.Keyword ],
    [ /^[ \t]+/, TokenTypes.Spaces ],
    [ /^:/, TokenTypes.Colon ],
    [ /^[A-Za-z_][A-Za-z0-9_]*/, TokenTypes.Word ],
    [ /^[0-9]+/, TokenTypes.Number ],
    [ /^[\r\n]+/, TokenTypes.LineBreak ],
    [ /^\(/, TokenTypes.OpenParen ],
    [ /^\)/, TokenTypes.CloseParen ],
    [ /^,/, TokenTypes.Comma ],
    [ /^=/, TokenTypes.SetEquals ],
    // [ /^./, null ],
];

class Token {
    constructor(type, raw) {
        this.type = type;
        this.raw = raw;
    }
    
    static from({ type, raw }) {
        return new Token(type, raw);
    }
    
    dump() {
        return `Token(type: ${this.type.toString()}, raw: ${JSON.stringify(this.raw)})`;
    }
}

const tokenize = (string) => {
    let tokens = [];
    let i = 0;
    while(i < string.length) {
        let slice = string.slice(i);
        
        let token;
        
        for(let [ regex, type ] of TokenRegexes) {
            let matched = slice.match(regex)
            if(matched) {
                let raw = matched[0];
                token = Token.from({ type, raw});
                i += raw.length;
                break;
            }
        }
        
        if(!token) {
            throw new Error(`Unknown character: '${string[i]}'`);
        }
        
        if(token.type === TokenTypes.Spaces && token.raw.includes(" ") && token.raw.includes("\t")) {
            throw new Error("Cannot mix tabs and spaces");
        }
        
        tokens.push(token);
    }
    
    return tokens;
};

const WordTypes = {
    Type: Symbol("WordTypes.Type"),
    Method: Symbol("WordTypes.Method"),
};

const TreeNodeTypes = {
    Declaration: Symbol("TreeNodeTypes.Declaration"),
    Assignment: Symbol("TreeNodeTypes.Assignment"),
    Structure: Symbol("TreeNodeTypes.Structure"),
    MethodDeclaration: Symbol("TreeNodeTypes.MethodDeclaration"),
    MethodCall: Symbol("TreeNodeTypes.MethodCall"),
    Pass: Symbol("TreeNodeTypes.Pass"),
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

class TreeParser {
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
        for(let i = 0; i < toMatch.length && this.tokenIndex + j < tokens.length; i++, j++) {
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
        console.log("~ parsing initial whitespace");
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
            spaceLevel = spaceCount = 0;
        }
        
        let previous = this.indent.level;
        this.indent.level = spaceLevel;
        return { previous, next: spaceLevel };
    }
    
    /**
     * Returns `true` if the step indicates parsing at the level is done, `false` otherwise.
     */
    parseStep(minLevel = 0) {
        console.log("-- parse once --");
        console.log(`[BEFORE RECALC] Current level: ${this.indent.level}, Minimum level: ${minLevel}`);
        // skip line breaks
        while(this.hasAhead(TokenTypes.LineBreak)) {
            this.parseLineBreak();
        }
        
        if(!this.hasTokensLeft()) {
            return true;
        }
        
        this.parseInitialWhitespace();
        
        console.log(`[BEFORE COMPARE] Current level: ${this.indent.level}, Minimum level: ${minLevel}`);
        if(!this.hasTokensLeft() || this.indent.level < minLevel) {
            return true;
        }
        
        if(this.hasAhead(TokenTypes.Keyword)) {
            let keyword = this.getTokenOffset(0).raw;
            if(keyword !== keyword.toUpperCase()) {
                keyword = keyword.toUpperCase();
                warn(`Keywords should be in all UPPERCASE, like '${keyword}'. If you meant something else, do not use a keyword here.`);
            }
            if(keyword === "STRUCTURE") {
                this.parseStructure();
            }
            else if(keyword === "METHOD") {
                this.parseMethod();
            }
            else if(keyword === "PASS") {
                this.parsePass();
            }
        }
        else {
            let succeeded = this.parseExpression();
            assert(succeeded, `Unhandled token: ${this.getTokenOffset(0)?.dump()}`);
        }
        
        return false;
    }
    
    parseExpression() {
        console.log("> parse expression");
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
    
    parseStructure() {
        console.log("> parsing structure");
        assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.Colon ]),
            "Malformed STRUCTURE command");
        
        let structureName = this.getTokenOffset(1).raw;
        this.skipMatched();
        
        assert(this.hasAhead(TokenTypes.LineBreak), "Expected line break after STRUCTURE command");
        this.tokenIndex++;
        
        console.log(this.tokens.slice(this.tokenIndex, this.tokenIndex + 3));
        // parse body
        let info = this.parseInitialWhitespace();
        let baseLevel = info.previous;
        let indentedLevel = info.next;
        
        console.log("WHITESPACE INFO", info);
        // TODO: multiple lines
        this.parseStep();//TODO: replace with call to special method?
        let node = this.nodes.pop();
        
        this.addNewNode(TreeNodeTypes.Structure, {
            name: structureName
        }, [ node ]);
    }
    
    parseMethod() {
        console.log("> parsing method");
        // TODO: methods with parameters
        assert(this.hasSequenceAhead([ TokenTypes.Keyword, TokenTypes.Word, TokenTypes.Colon ]),
            "Malformed METHOD command");
        let methodName = this.getTokenOffset(1).raw;
        this.skipMatched();
        let baseLevel = this.indent.level;
        assert(this.indent.level === 0, "Can only have method declarations at base level");
        let nodeLength = this.nodes.length;
        console.group();
        this.parse(baseLevel + 1);
        console.groupEnd();
        let children = this.nodes.splice(nodeLength);
        this.addNewNode(TreeNodeTypes.MethodDeclaration, { name: methodName }, children);
    }
    
    parsePass() {
        this.tokenIndex++;
        this.addNewNode(TreeNodeTypes.Pass);
    }
    
    parseLineBreak() {
        console.log("> skipping line break");
        this.tokenIndex++;
    }
    
    parseAssignmentExpression(word) {
        console.log("> assignment");
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
        console.log("> parse type decl");
        let declared = this.parseParameterized();
        assert(declared.length > 0, `Expected 1 or more variables for ${type} variable declaration.`);
        let type = word.raw;
        if(type === "Array") {
            // parameterized declaration
            this.addNewNode(TreeNodeTypes.Declaration, { type, declared });
        }
        else {
            // declare multiple as same type
            for(let { raw } of declared) {
                this.variableTypes[raw] = type;
            }
            this.addNewNode(TreeNodeTypes.Declaration, { type, declared });
        }
    }
    
    parseMethodEvaluation(word) {
        console.log("> parse method eval");
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

const makeTree = (tokens) => {
    let parser = new TreeParser(tokens);
    try {
        console.log(parser.parse());
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

// const text = fs.readFileSync("evaluate.cir");
const text = fs.readFileSync("test.cir").toString();

let tokens = tokenize(text);
let tree = makeTree(tokens);

console.log(tree);