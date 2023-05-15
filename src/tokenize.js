export const TokenTypes = {
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
    Comment: Symbol("TokenTypes.Comment"),
    Operator: Symbol("TokenTypes.Operator"),
    ReturnTypeIndicator: Symbol("TokenTypes.ReturnTypeIndicator"),
};

const KEYWORD_LIST = `
    STRUCTURE
    METHOD
    REPEAT TIMES
    SETMODE DEFAULT DEFINE CHOOSE
    FOR TO
    PASS RETURN
    IF WHILE ELSE ELSEIF ELSIF ELIF
    MUTABLE
`.trim().split(/\s+/);

// add /i flag to allow mixed case keywords
const KeywordRegex = new RegExp(`^(?:${KEYWORD_LIST.join("|")})\\b`);

const TokenRegexes = [
    [ KeywordRegex, TokenTypes.Keyword ],
    [ /^(?:\/\/)[\s\S]*?(?:\n|$)/, TokenTypes.Comment ],
    [ /^[ \t]+/, TokenTypes.Spaces ],
    [ /^:/, TokenTypes.Colon ],
    [ /^(?:->|→)/, TokenTypes.ReturnTypeIndicator ],
    [ /^[A-Za-z_][A-Za-z0-9_]*/, TokenTypes.Word ],
    [ /^[0-9]+/, TokenTypes.Number ],
    [ /^[\r\n]+/, TokenTypes.LineBreak ],
    [ /^(?:[-+*\/!~^|&]|or|and|is)/, TokenTypes.Operator ],
    [ /^\(/, TokenTypes.OpenParen ],
    [ /^\)/, TokenTypes.CloseParen ],
    [ /^,/, TokenTypes.Comma ],
    [ /^=/, TokenTypes.SetEquals ],
    // [ /^./, null ],
];

export class Token {
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

export const tokenize = (string) => {
    let tokens = [];
    let i = 0;
    while(i < string.length) {
        let slice = string.slice(i);
        
        let token;
        
        for(let [ regex, type ] of TokenRegexes) {
            let matched = slice.match(regex);
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
