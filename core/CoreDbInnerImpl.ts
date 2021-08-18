import {Collection, Filter, OptionalId} from "mongodb";
import {ApplicationError} from "../error/ApplicationError";
import {CollectionArg, CoreDbInner, SystemCollection} from "./index";
import {SocketStore} from "../@types/data";
import {Core} from "../index";
const matchAll = require("match-all");

export class CoreDbInnerImpl implements CoreDbInner {
  public constructor(private core: Core) {}

  public async dbFindOne<T>(
    filter: Filter<StoreData<T>>,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; data: StoreData<T> | null }> {
    return this.dbFindOneRaw<StoreData<T>>(filter, collectionArg);
  }

  public async dbFindOneRaw<T>(
    filter: Filter<T>,
    collectionArg: CollectionArg<T>
  ): Promise<{ collection: Collection<T>; data: T | null }> {
    const collection = await this.getCollection<T>(collectionArg, false);
    const data = await collection.findOne(filter, {});
    return { collection, data: data || null };
  }

  public async dbFind<T>(
    filter: Filter<StoreData<T>>,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; dataList: StoreData<T>[] }> {
    const collection = await this.getCollection<StoreData<T>>(collectionArg, false);
    const dataList = await collection.find(filter, {}).sort("order", "asc").toArray();
    return { collection, dataList };
  }

  public async dbFindRaw<T>(
    filter: Filter<T>,
    collectionArg: CollectionArg<T>
  ): Promise<{ collection: Collection<T>; dataList: T[] }> {
    const collection = await this.getCollection<T>(collectionArg, false);
    const dataList = await collection.find(filter, {}).toArray();
    return { collection, dataList };
  }

  public async resistCollectionName(collectionName: string): Promise<void> {
    const { cnPrefix, cnSuffix } = this.core.lib.splitCollectionName(collectionName);
    if (cnSuffix === "collection-list") return;
    const cnc = await this.getCollection<{ suffix: string }>(["collection-list", cnPrefix], true);
    const data = await cnc.findOne({ suffix: cnSuffix });
    if (data) return;
    await cnc.insertOne({ suffix: cnSuffix });
  }

  public async getCollection<T>(arg: CollectionArg<T>, forInsert: boolean): Promise<Collection<T>> {
    if (arg.constructor === Collection) return arg;
    let collectionName: string = "";
    if (typeof arg === "string") {
      collectionName = arg;
    } else if (Array.isArray(arg)) {
      if (arg.length !== 2)
        throw new ApplicationError("Illegal argument. length !== 2.");

      const suffix = arg[0];
      let prefix: string;
      if (typeof arg[1] === "string") prefix = arg[1];
      else {
        const {socketInfo} = (await this.getSocketInfo(arg[1]));
        prefix = socketInfo?.roomCollectionPrefix || "";
      }
      collectionName = `${prefix}-DATA-${suffix}`;
    } else {
      collectionName = (arg as SystemCollection).name;
    }
    if (forInsert) await this.resistCollectionName(collectionName);
    return this.core.db.collection<T>(collectionName);
  }

  public async getMaxOrder<T>(
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; maxOrder: number }> {
    const collection = await this.getCollection<StoreData<T>>(collectionArg, true);
    const list = (await collection.find().sort("order", -1).limit(1).toArray());
    return { collection, maxOrder: list.length ? -1 : list[0].order };
  }

  public async addRefList(
    socket: any,
    collection: Collection<StoreData<any>>,
    data: StoreData<any> | null | undefined,
    refInfo: { type: string; key: string }
  ): Promise<void> {
    if (!data) return;
    if (data.refList.some(ref => ref.type === refInfo.type && ref.key === refInfo.key)) return;
    data.refList.push(refInfo);
    await this.dbUpdateOne<any>(
      { key: data.key },
      { refList: data.refList },
      socket,
      collection
    );
  }

  public async deleteRefList(
    socket: any,
    collectionArg: CollectionArg<any>,
    data: StoreData<any> | null | undefined,
    refInfo: { type: string; key: string }
  ): Promise<void> {
    if (!data) return;
    const index = data.refList.findIndex(ref =>
      ref.type === refInfo.type && ref.key === refInfo.key
    );
    if (index > -1) {
      data.refList.splice(index, 1);
      await this.dbUpdateOne<any>(
        { key: data.key },
        { refList: data.refList },
        socket,
        collectionArg
      );
    }
  }

  public async getAllReference(
    cnPrefix: string,
    type: string,
    key: string,
    additionalCollectionSuffixList: string[] = []
  ): Promise<DataReference[]> {
    const refList: DataReference[] = [];

    if (type === "media-list") {
      const regExp = new RegExp(`"mediaKey": ?"${key}"`, "g");
      [
        "scene-object-list",
        "scene-list",
        "public-memo-list",
        "resource-master-list",
        ...additionalCollectionSuffixList
      ].map(async suffix => {
        const { dataList } = await this.dbFind<any>({}, [suffix, cnPrefix]);
        dataList.forEach(d => {
          const str = JSON.stringify(d);
          const matchResult = str.match(regExp);
          if (!matchResult) return;
          refList.push({
            type: suffix,
            key: d.key
          });
        });
      })
    }
    return refList;
  }

  public getTargetPropertyValueList(data: any, property: string): string[] {
    if (!data) return [];
    const regExp = new RegExp(`"${property}": ?"([^"]+)"`, "g");
    return matchAll(JSON.stringify(data), regExp)
      .toArray()
      .filter(
        (mediaKey: string, index: number, list: string[]) =>
          list.findIndex(
            l => l === mediaKey
          ) === index
      );
  }

  public async updateMediaKeyRefList<T>(
    socket: any,
    cnPrefix: string,
    data: T,
    type: string,
    key: string,
    operation: "add" | "delete" | "update",
    originalData?: T
  ): Promise<void> {
    const mediaKeyList = this.getTargetPropertyValueList(data, "mediaKey");

    const simple = async (operation: "add" | "delete", mediaKeyList: string[]): Promise<void> => {
      if (!mediaKeyList.length) return;
      await Promise.all(
        mediaKeyList.map(async mediaKey => {
          const {collection, data} = await this.dbFindOne<MediaStore>(
            { key: mediaKey },
            [ "media-list", cnPrefix]
          );
          if (operation === "add") {
            await this.addRefList(socket, collection, data, { type, key });
          } else {
            await this.deleteRefList(socket, collection, data, { type, key });
          }
        })
      );
    };

    if (operation !== "update") {
      return simple(operation, mediaKeyList);
    }

    const originalMediaKeyList = this.getTargetPropertyValueList(originalData, "mediaKey");

    await simple("delete", originalMediaKeyList.filter(
      originalKey => !mediaKeyList.some(key => key === originalKey)
    ));
    await simple("add", mediaKeyList.filter(
      key => !originalMediaKeyList.some(originalKey => originalKey === key)
    ));
  }

  public async dbUpdateOne<T>(
    filter: Filter<StoreData<T>>,
    updateData: Partial<StoreData<Partial<T>>>,
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<Collection<StoreData<T>>> {
    const collection = await this.getCollection<StoreData<T>>(collectionArg, false);
    const originalData = await collection.findOne<StoreData<T>>(filter, {});
    if (!originalData) throw new ApplicationError("No such original data.");
    const upData: StoreData<T> = {
      ...originalData,
      ...updateData,
      updateTime: new Date()
    } as StoreData<T>;
    upData.data = {
      ...originalData.data,
      ...(updateData.data || {})
    } as T;
    await collection.updateOne(filter, upData);
    return collection;
  }

  public async dbUpdateOneRaw<T>(
    filter: Filter<T>,
    updateData: Partial<T>,
    socket: any,
    collectionArg: CollectionArg<T>
  ): Promise<Collection<T>> {
    const collection = await this.getCollection<T>(collectionArg, false);
    const originalData = await collection.findOne<T>(filter, {});
    const upData: T = {
      ...originalData,
      ...updateData
    } as T
    await collection.updateOne(filter, upData);
    return collection;
  }

  public async dbDeleteOne(
    key: string,
    socket: any,
    collectionArg: CollectionArg<StoreData<any>>,
  ): Promise<void> {
    const collection = await this.getCollection<any>(collectionArg, false);
    await collection.deleteOne({ key });
  }

  public async dbInsertOne<T>(
    insertData: StoreData<T>,
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
  ): Promise<Collection<StoreData<T>>> {
    return this.dbInsertOneRaw<StoreData<T>>(insertData, socket, collectionArg);
  }

  public async dbInsertOneRaw<T>(
    insertData: OptionalId<T>,
    socket: any,
    collectionArg: CollectionArg<T>,
  ): Promise<Collection<T>> {
    const collection = await this.getCollection<T>(collectionArg, true);
    await collection.insertOne(insertData);
    return collection;
  }

  public async dbInsert<T>(
    insertDataList: OptionalId<StoreData<T>>[],
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
  ): Promise<Collection<StoreData<T>>> {
    return this.dbInsertRaw<StoreData<T>>(insertDataList, socket, collectionArg);
  }

  public async dbInsertRaw<T>(
    insertDataList: OptionalId<T>[],
    socket: any,
    collectionArg: CollectionArg<T>,
  ): Promise<Collection<T>> {
    const collection = await this.getCollection<T>(collectionArg, true);
    await collection.insertMany(insertDataList);
    return collection;
  }

  public async getAllCollection(cnPrefix: string): Promise<string[]> {
    const { dataList } = await this.dbFindRaw<{ suffix: string }>({}, ["collection-list", cnPrefix]);
    return dataList.map(d => d.suffix);
  }

  public async getSocketInfo(socket: any): Promise<{
    socketCollection: Collection<SocketStore>;
    socketInfo: SocketStore
  }> {
    const { collection: socketCollection, data: socketInfo } = await this.dbFindOneRaw<SocketStore>({ socketId: socket.id }, this.core.COLLECTION_SOCKET);
    if (!socketInfo) throw new ApplicationError(`No such socket.`, { socketId: socket.id });
    return { socketCollection, socketInfo };
  }

  public async getRoomMateSocketInfoList(socket: any): Promise<{
    socketCollection: Collection<SocketStore>;
    socketInfoList: SocketStore[]
  }> {
    const {socketInfo: selfInfo, socketCollection} = await this.getSocketInfo(socket);
    const otherList = await socketCollection.find<SocketStore>({ $and: [{socketId: { $ne: socket.id }}, {roomKey: selfInfo.roomKey}] }).toArray();
    return {
      socketCollection,
      socketInfoList: [
        selfInfo,
        ...otherList
      ]
    }
  }
}
