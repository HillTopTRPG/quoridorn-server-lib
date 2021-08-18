import * as YAML from "yaml";
import * as fs from "fs";
import {compareVersion, TargetClient} from "../_GitHub";
import {SystemError} from "../error/SystemError";
import {Interoperability} from "../index";
const crypto = require("crypto");

export function readText(path: string): string {
  return fs.readFileSync(path, "utf8");
}

export function readYaml<T>(path: string): T {
  return YAML.parse(readText(path)) as T;
}

export function getFileHash(arrayBuffer: ArrayBuffer | string) {
  return crypto.createHash('sha512').update(arrayBuffer).digest('hex');
}

export async function getTargetClient(
  process: NodeJS.Process,
  interoperabilityYamlPath: string
): Promise<TargetClient> {
  if (!process.env.npm_package_version) {
    throw new SystemError(`The version is not set in package.json.`);
  }
  const version: string = `Quoridorn ${process.env.npm_package_version.replace("-", "")}`;
  const targetClient: TargetClient = { from: null, to: null }
  const iList: Interoperability[] = readYaml(interoperabilityYamlPath);
  if (compareVersion(iList[0].server, version) <= 0) {
    // サーバが最新系
    targetClient.from = iList[0].client;
  } else {
    // サーバは最新系ではない
    iList.forEach((i, index) => {
      if (!index) return;
      if (
        compareVersion(iList[index - 1].server, version) > 0 &&
        compareVersion(i.server, version) <= 0
      ) {
        targetClient.from = i.client;
        targetClient.to = iList[index - 1].client;
      }
    });
  }

  return targetClient;
}

