const bcrypt = require("bcrypt");

/* TODO
 * 現在、Argon2 がビルドできないためサポート外の暗号化アルゴリズムとなっている。
 * この問題がクリアできれば、Argon2 アルゴリズムを使いたい。
 */

/**
 * パスワードをハッシュ化する
 * @param planeText
 * @param option
 */
export async function hash(
  planeText: string,
  option: any = {}
): Promise<string> {
  const hashRaw = (await (new Promise((resolve, reject) => {
    if (!("saltRounds " in option) || typeof option.saltRounds !== "number") option.saltRounds = 10;
    bcrypt.hash(planeText, option.saltRounds, generateDefaultPromiseCallback(resolve, reject));
  }))) as string;
  return "hashed:" + hashRaw;
}

/**
 * パスワードを照合する
 * @param hash
 * @param planeText
 */
export async function verify(
  hash: string,
  planeText: string,
): Promise<boolean> {
  const hashRaw = hash.replace(/^hashed:/, "");
  return new Promise((resolve, reject) => {
    bcrypt.compare(planeText, hashRaw, generateDefaultPromiseCallback(resolve, reject));
  });
}

const generateDefaultPromiseCallback =
  (resolve: (result: any) =>
    void, reject: (err: any) => void) =>
      (err: any, result: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      };
