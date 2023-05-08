export class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = "AssertionError";
    }
}


export const assert = (expression, message="Assertion failed") => {
    if(!expression) {
        throw new AssertionError(message);
    }
};

export const toImplement = (message) => assert(null, "TODO: IMPLEMENT `" + message + "`");

export const warn = (message) => {
    console.warn(message);
    // TODO: warns as errors
};
