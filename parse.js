import { toggle } from "./lib/LOG.js";
import { PdfReader, Rule, parseTable, TableParser } from "./index.js";
import assert from "assert";
import _ from "lodash";
import * as fs from "fs";

import { start } from "repl";

toggle(true);

function printRawItems(filename, callback) {
  new PdfReader().parseFileItems(filename, function (err, item) {
    if (err) callback(err);
    else if (!item) callback();
    else if (item.file) console.log("file =", item.file.path);
    else if (item.page) console.log("page =", item.page);
    else if (item.x)
      console.log(
        [item.x, item.y, item.oc, item.A, Math.floor(item.w), item.text].join(
          "\t"
        )
      );
    else console.warn(item);
  });
}

function printTableFromPdf(filePath) {
  const res = new Promise((resolve, reject) => {
    const content = [];
    const rules = [
      Rule.on(/^THIS BILL SUMMARY\"(.*)\"$/)
        .extractRegexpValues()
        .then((value) => content.push({ extractRegexpValues: value })),
      Rule.on(/^Value\:/)
        .parseNextItemValue()
        .then((value) => content.push({ parseNextItemValue: value })),
      Rule.on(/^c1$/)
        .parseTable(3)
        .then((table) =>
          content.push({
            "parseTable.renderMatrix": parseTable.renderMatrix(table.matrix),
            "parseTable.renderItems": parseTable.renderItems(table.items),
          })
        ),
      Rule.on(/^Values\:/)
        .accumulateAfterHeading()
        .then((value) => content.push({ accumulateAfterHeading: value })),
    ];
    const processItem = Rule.makeItemProcessor(rules);
    new PdfReader({ debug: 1 }).parseFileItems(filePath, (err, item) => {
      if (err) reject(err);
      else {
        processItem(item);
        if (!item) resolve(content);
      }
    });
  });
  return res;
}

async function parseTableFromPdf(filePath) {
  const table = new TableParser();
  const matrix = await new Promise((resolve, reject) => {
    // the thresholds were determined manually, based on the horizontal position (x) for column headers
    const colThresholds = [
      0.875,
      12.378,
      16.971,
      17.549,
      20.835,
      21.702,
      26.266,
      30.653,
      32,
      36,
      Infinity,
    ];

    const columnQuantitizer = (item) => {
      const col = colThresholds.findIndex(
        (colThreshold) => parseFloat(item.x) < colThreshold
      );
      assert(col >= 0, col);
      assert(col < colThresholds.length, col);
      // console.log(`COL ${col}\t${parseFloat(item.x)}\t${item.text}`);
      return col;
    };
    new PdfReader().parseFileItems(filePath, (err, item) => {
      if (err) reject(err);
      else if (!item) {
        resolve(table.getCleanMatrix({ collisionSeparator: "" }));
      } else if (item.text) {
        table.processItem(item, columnQuantitizer(item));
      }
    });
  });
  console.table(matrix);
  //console.tab(table.renderMatrix(matrix));
  buildMapByKey(_.last(_.split(filePath, "/")), matrix);
}
var jsonString = {};
const groupByMap = new Map();
function buildMapByKey(keyColumn, matrix) {
  var totalsColumnIndex;
  matrix.map(function (row, i) {
    if (!totalsColumnIndex) {
      totalsColumnIndex = _.findIndex(row, function (o) {
        return o == "Total";
      });
    }
    if (i != 0 && row[totalsColumnIndex]) {
      if (groupByMap.has(row[0])) {
        var val = groupByMap.get(row[0]);
        groupByMap.set(
          row[0],
          val + parseFloat(row[totalsColumnIndex].replace("$", ""))
        );
      } else {
        groupByMap.set(
          row[0],
          parseFloat(row[totalsColumnIndex].replace("$", ""))
        );
      }
    }
  });
  jsonString[
    keyColumn
      .replace(".pdf", "")
      .replace("SummaryBill", "")
      .replace("DetailedBill", "")
  ] = Object.fromEntries(groupByMap);
  console.log(JSON.stringify(jsonString));
}
async function main() {
  var filename = process.argv[2];
  if (fs.lstatSync(filename).isDirectory()) {
    fs.readdirSync(filename).forEach(async (file) => {
      console.log(file);
      await parseTableFromPdf(filename + "/" + file);
    });
  }
  if (!filename) {
    console.error("please provide the name of a PDF file");
  } else {
    console.warn("printing raw items from file:", filename, "...");
    /* printRawItems(filename, function (err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });*/
    /*const parsedResult = await printTableFromPdf(filename);
    console.log("Parsed table output", parsedResult);
    console.warn("done.");*/
    //await parseTableFromPdf(filename);
  }
}

main();
