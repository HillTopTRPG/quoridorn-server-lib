import {Db, MongoClient} from "mongodb";
import {
  AddDirectRequest,
  Core,
  DeleteDataRequest,
  DeleteFunc,
  InsertFunc, StoreData,
  UpdateDataRequest,
  UpdateFunc
} from "../index";

export async function connectMongoDb(connectionString: string, dbNameSuffix: string): Promise<Db> {
  const client = await MongoClient.connect(connectionString);
  return client.db(`quoridorn-${dbNameSuffix}`);
}

export async function dbApiInsertDelegate<T>(
  core: Core,
  insertFuncMap: Map<string, InsertFunc>,
  socket: any,
  arg: AddDirectRequest<T>,
  sendNotify?: boolean,
  nestNum?: number,
  nestNumTotal?: number
): Promise<string[]> {
  const cnSuffix = arg.collectionSuffix;

  const callFunc =
    insertFuncMap.get(cnSuffix)?.bind(null, core, socket, cnSuffix, arg.share, arg.force) ||
    core._simpleDb.addSimple.bind(core._simpleDb, socket, [cnSuffix, socket], arg.share, arg.force);

  // 非同期処理を直列で実行していく
  const dataList = await core.lib.gatlingAsync<StoreData<unknown>>(
    arg.list.map(callFunc),
    sendNotify ? socket : undefined,
    nestNum,
    nestNumTotal
  );

  return dataList.map(d => d.key);
}


export async function dbApiDeleteDelegate(
  core: Core,
  deleteFuncMap: Map<string, DeleteFunc>,
  socket: any,
  arg: DeleteDataRequest,
  sendNotify?: boolean,
  nestNum?: number,
  nestNumTotal?: number
): Promise<void> {
  const cnSuffix = arg.collectionSuffix;

  const callFunc =
    deleteFuncMap.get(cnSuffix)?.bind(null, core, socket, cnSuffix, arg.share) ||
    core._simpleDb.deleteSimple.bind(core._simpleDb, socket, [cnSuffix, socket], arg.share);

  // 非同期処理を直列で実行していく
  await core.lib.gatlingAsync<void>(
    arg.list.map(data => callFunc(data)),
    sendNotify ? socket : undefined,
    nestNum,
    nestNumTotal
  );
}

export async function dbApiUpdateDelegate(
  core: Core,
  updateFuncMap: Map<string, UpdateFunc>,
  socket: any,
  arg: UpdateDataRequest<any>,
  sendNotify?: boolean,
  nestNum?: number,
  nestNumTotal?: number
): Promise<void> {
  const cnSuffix = arg.collectionSuffix;

  const callFunc =
    updateFuncMap.get(cnSuffix)?.bind(null, core, socket, cnSuffix, arg.share) ||
    core._simpleDb.updateSimple.bind(core._simpleDb, socket, [cnSuffix, socket], arg.share);

  // 非同期処理を直列で実行していく
  await core.lib.gatlingAsync<void>(
    arg.list.map(callFunc),
    sendNotify ? socket : undefined,
    nestNum,
    nestNumTotal
  );
}
