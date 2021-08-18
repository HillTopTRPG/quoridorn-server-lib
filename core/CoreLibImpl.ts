import * as uuid from "uuid";
import {CoreLib} from "./index";
import fetch, {Response} from 'node-fetch';
import {Core} from "../index";

export class CoreLibImpl implements CoreLib {
  public constructor(private core: Core) {}

  public splitCollectionName(collectionName: string): { cnPrefix: string; cnSuffix: string } {
    const sp = collectionName.split("-DATA-");
    return {
      cnPrefix: sp[0],
      cnSuffix: sp[1] || ""
    };
  }

  public async fetch(url: string): Promise<Response> {
    return fetch(url);
  }

  /**
   * 非同期処理を直列で実行していく
   * @param promiseList
   * @param socket socketを省略しなかったらクライアントに通知を送る
   * @param nestNum
   * @param nestNumTotal
   */
  public async gatlingAsync<T>(
    promiseList: Promise<T>[],
    socket?: any,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<T[]> {
    const total = nestNumTotal || promiseList.length;
    const resultList: T[] = [];
    await promiseList
      .map((p, idx) => async () => {
        if (socket) await this.core.socket.notifyProgress(socket, total, (nestNum || 0) + idx);
        resultList.push(await p)
      })
      .reduce((prev, curr) => prev.then(curr), Promise.resolve());
    if (socket) await this.core.socket.notifyProgress(socket, total, (nestNum || 0) + promiseList.length);
    return resultList;
  }

  public makeKey(): string {
    return uuid.v4();
  }

  public equals(data1: any, data2: any): boolean {
    return JSON.stringify(data1) === JSON.stringify(data2);
  }
}
