import fs from "fs";
import { tokenize } from "./src/tokenize.js";
import { makeTree } from "./src/tree-parse.js";
import { skeletonize } from "./src/skeletonize.js";

// const text = fs.readFileSync("evaluate.cir");
const text = fs.readFileSync("aes.cir").toString();

let tokens = tokenize(text);
let treeNodes = makeTree(tokens);
let skeletonCode = skeletonize(treeNodes);

console.log(skeletonCode);
