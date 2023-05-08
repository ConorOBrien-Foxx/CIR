import fs from "fs";
import { tokenize } from "./src/tokenize.js";
import { makeTree } from "./src/tree-parse.js";

// const text = fs.readFileSync("evaluate.cir");
const text = fs.readFileSync("test.cir").toString();

let tokens = tokenize(text);
let tree = makeTree(tokens);

console.log(tree);
