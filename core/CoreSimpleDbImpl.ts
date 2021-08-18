import {ApplicationError} from "../error/ApplicationError";
import {Core, DataReference, PERMISSION_DEFAULT, StoreData, UserStore} from "../index";
import * as uuid from "uuid";
import {CollectionArg, CoreSimpleDb} from "./index";

export class CoreSimpleDbImpl implements CoreSimpleDb {
  public constructor(private core: Core) {}

  public async addSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other",
    force: boolean,
    data: Partial<StoreData<T>> & { data: T }
  ): Promise<StoreData<T>> {
    const { socketInfo } = await this.core._dbInner.getSocketInfo(socket);
    const cnPrefix = socketInfo.roomCollectionPrefix;
    if (!cnPrefix) throw new ApplicationError("Not yet logged in.");
    const {collection, maxOrder} = await this.core._dbInner.getMaxOrder<T>(collectionArg);
    const { cnSuffix } = this.core.lib.splitCollectionName(collection.collectionName);

    let originalData: StoreData<T> | null = null;

    if (data.key !== undefined) {
      const { data: findData } = await this.core._dbInner.dbFindOne<any>({ key: data.key }, collection);
      originalData = findData;
    }

    if (originalData && force) {
      await this.deleteSimple(socket, collection, share, originalData.key);
    }

    data.collection = cnSuffix;
    const ownerType = data.ownerType !== undefined ? data.ownerType : "user-list";
    const owner = data.owner || socketInfo.userKey;
    const order = data.order !== undefined ? data.order : maxOrder + 1;
    const now = new Date();
    const permission = data.permission || PERMISSION_DEFAULT;
    const key = data.key !== undefined && !originalData ? data.key : uuid.v4();
    const refList: DataReference[] = [];

    if (ownerType && owner) {
      if (ownerType === "user-list") {
        const { data, collection } = await this.core._dbInner.dbFindOne<UserStore>({ key: owner }, [ownerType, cnPrefix]);
        await this.core._dbInner.addRefList(socket, collection, share, data, { type: cnSuffix, key });
      }
    }

    await this.core._dbInner.updateMediaKeyRefList<T>(
      socket,
      cnPrefix,
      share,
      data.data,
      data.collection,
      key,
      "add"
    );

    refList.push(...await this.core._dbInner.getAllReference(
      cnPrefix,
      cnSuffix,
      key
    ));

    const addInfo: StoreData<T> = {
      collection: data.collection,
      key,
      order,
      ownerType,
      owner,
      permission,
      status: "added",
      createTime: now,
      updateTime: now,
      refList,
      data: data.data
    };

    try {
      await collection.insertOne(addInfo);
    } catch (err) {
      throw new ApplicationError(`Failure add doc.`, addInfo);
    }

    await this.core.socket.emitSocketEvent(
      socket,
      share,
      "notify-insert-data",
      null,
      addInfo
    );
    return addInfo;
  }

  public async deleteSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other",
    key: string
  ): Promise<void> {
    const { socketInfo } = await this.core._dbInner.getSocketInfo(socket);
    const cnPrefix = socketInfo.roomCollectionPrefix;
    if (!cnPrefix) throw new ApplicationError("Not yet logged in.");
    const { data, collection } = await this.core._dbInner.dbFindOne<T>({ key }, collectionArg);
    const { cnSuffix } = this.core.lib.splitCollectionName(collection.collectionName);
    const msgArg = { collection: collection.collectionName, key };

    if (!data) throw new ApplicationError(`Untouched data.`, msgArg);
    if (!data || !data.data) throw new ApplicationError(`Already deleted.`, msgArg);

    const ownerType = data.ownerType;
    const ownerKey = data.owner;
    if (ownerType && ownerKey) {
      const { data: ownerData, collection: ownerCollection } = await this.core._dbInner.dbFindOne<any>({ key: ownerKey }, [ownerType, cnPrefix]);
      await this.core._dbInner.deleteRefList(socket, ownerCollection, share, ownerData, { type: cnSuffix, key });
    }

    // データ中にmedia-listへの参照を含んでいた場合はmedia-listの参照情報を削除する
    await this.core._dbInner.updateMediaKeyRefList<T>(
      socket,
      cnPrefix,
      share,
      data.data,
      cnSuffix,
      key,
      "delete"
    );

    try {
      await this.core._dbInner.dbDeleteOne(key, collection);
    } catch (err) {
      throw new ApplicationError(`Failure delete doc.`, msgArg);
    }

    await this.core.socket.emitSocketEvent(
      socket,
      share,
      "notify-delete-data",
      null,
      {key, type: cnSuffix}
    );
  }

  public async updateSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other",
    data: (Partial<StoreData<Partial<T>>> & { key: string })
  ): Promise<void> {
    const {socketInfo} = await this.core._dbInner.getSocketInfo(socket);
    const cnPrefix = socketInfo.roomCollectionPrefix;
    if (!cnPrefix)
      throw new ApplicationError("Not yet login.");
    const { data: originalData, collection } = await this.core._dbInner.dbFindOne<T>({ key: data.key }, collectionArg);
    if (!originalData)
      throw new ApplicationError(`No such data.`, { arg: JSON.stringify(collectionArg)});
    const cnSuffix = originalData.collection;

    if (originalData.ownerType && originalData.owner) {
      const originalOwnerRef: DataReference = { type: originalData.ownerType, key: originalData.owner };
      const newOwnerRef: DataReference = {
        type: data.ownerType !== undefined ? data.ownerType : originalData.ownerType,
        key: data.owner !== undefined ? data.owner : originalData.owner
      };
      let isDeleteRefList: boolean = false;
      let isAddRefList: boolean = false;

      if (newOwnerRef.type !== originalOwnerRef.type || newOwnerRef.key !== originalOwnerRef.key) {
        isDeleteRefList = Boolean(originalOwnerRef.type) && Boolean(originalOwnerRef.key);
        isAddRefList = Boolean(newOwnerRef.type) && Boolean(newOwnerRef.key);
      }
      if (isDeleteRefList) {
        const { data: ownerData, collection: ownerCollection } = await this.core._dbInner.dbFindOne(
          { key: originalOwnerRef.key! },
          [originalOwnerRef.type!, cnPrefix]
        );
        await this.core._dbInner.deleteRefList(
          socket,
          ownerCollection,
          share,
          ownerData!,
          { type: cnSuffix, key: data.key! }
        );
      }
      if (isAddRefList) {
        const { data: ownerData, collection: ownerCollection } = await this.core._dbInner.dbFindOne(
          { key: newOwnerRef.key! },
          [newOwnerRef.type!, cnPrefix]
        );
        await this.core._dbInner.addRefList(
          socket,
          ownerCollection,
          share,
          ownerData,
          { type: cnSuffix, key: data.key! }
        )
      }
    }

    const updateInfo: StoreData<T> = {
      ...originalData,
      ...data,
      status: "modified",
      updateTime: new Date()
    } as StoreData<T>;
    if (data.data !== undefined) {
      updateInfo.data = {
        ...originalData.data,
        ...data.data,
      } as T;

      await this.core._dbInner.updateMediaKeyRefList(
        socket,
        cnPrefix,
        share,
        updateInfo.data,
        cnSuffix,
        data.key,
        "update",
        originalData.data
      );
    }
    try {
      await this.core._dbInner.dbUpdateOne({ key: data.key }, updateInfo, collection);
    } catch (err) {
      throw new ApplicationError(`Failure update doc.`, updateInfo);
    }

    await this.core.socket.emitSocketEvent(
      socket,
      share,
      "notify-update-data",
      null,
      updateInfo
    );
  }
}
