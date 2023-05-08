import fs from "fs";
import { tokenize, makeTree } from "./tokenize.js";

// const text = fs.readFileSync("evaluate.cir");
const text = fs.readFileSync("test.cir").toString();

let tokens = tokenize(text);
let tree = makeTree(tokens);

console.log(tree);
