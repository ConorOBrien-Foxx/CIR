import { tokenize } from "./src/tokenize.js";
import { makeTree } from "./src/tree-parse.js";
import { skeletonize } from "./src/skeletonize.js";

window.addEventListener("load", function () {
    let input = document.getElementById("ir-input");
    let output = document.getElementById("ir-output");
    document.getElementById("go").addEventListener("click", function () {
        let text = input.value;
        let tokens = tokenize(text);
        let treeNodes = makeTree(tokens);
        let skeletonCode = skeletonize(treeNodes);
        output.value = skeletonCode;
    });
});
