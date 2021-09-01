import * as Minio from "minio";
import {Core, MediaStore, MinioSetting, UploadMediaInfo, UploadMediaRequest, UploadMediaResponse, getFileHash} from "../index";
import * as path from "path";

type MinioSettingRaw = {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
};

export async function makeMinioClient(setting: MinioSetting): Promise<{ bucket: string; accessUrl: string; s3Client: Minio.Client }> {
  const clientOption: MinioSettingRaw = {
    endPoint: setting.endPoint,
    port: setting.port,
    useSSL: setting.useSSL,
    accessKey: setting.accessKey,
    secretKey: setting.secretKey
  };
  const bucket = setting.bucket;
  const accessUrl = setting.accessUrl;

  let s3Client: Minio.Client | null = null;
  try {
    s3Client = new Minio.Client(clientOption);
  } catch (err) {
    console.error("S3 Storage connect failure.");
    console.error(JSON.stringify(clientOption, null, "  "));
    console.error(err);
    throw err;
  }

  try {
    await s3Client!.putObject(bucket, "sample-test.txt", "sample-text");
    console.log("S3 Storage upload-test success.");
    console.log(`S3 Storage connect success. (bucket: ${bucket})`);
  } catch (err) {
    console.error("S3 Storage upload-test failure.");
    console.error(JSON.stringify(clientOption, null, "  "));
    console.error(err);
    throw err;
  }

  return {
    bucket,
    accessUrl,
    s3Client
  };
}

export async function mediaApiUploadDelegate(
  core: Core,
  socket: any,
  arg: UploadMediaRequest
): Promise<UploadMediaResponse> {
  const { socketInfo } = (await core._dbInner.getSocketInfo(socket));
  const storageId = socketInfo.storageId!;
  const cnPrefix = socketInfo.roomCollectionPrefix;

  type CheckedInfo = {
    key: string;
    existKey: string | null;
    rawInfo: UploadMediaInfo
  };

  const duplicateCheck = async (info: UploadMediaInfo): Promise<CheckedInfo> => {
    if (info.key === undefined) info.key = core.lib.makeKey();

    const hash = info.dataLocation === "server" ? getFileHash(info.arrayBuffer!) : info.url;
    const {data: duplicateMedia} = await core._dbInner.dbFindOne<MediaStore>(
      { "data.hash": hash },
      ["media-list", cnPrefix]
    );

    let isDuplicate = Boolean(duplicateMedia);
    info.hash = hash;

    isDuplicate = isDuplicate && !core.lib.equals(arg.option.permission, duplicateMedia!.permission);
    isDuplicate = isDuplicate && arg.option.ownerType !== duplicateMedia!.ownerType;
    isDuplicate = isDuplicate && arg.option.owner !== duplicateMedia!.owner;
    if (isDuplicate) {
      info.url = duplicateMedia!.data!.url;
    }

    return {
      key: info.key!,
      existKey: duplicateMedia?.key || null,
      rawInfo: info
    };
  };

  // 非同期処理を直列で実行していく
  const checkedList = await core.lib.gatlingAsync<CheckedInfo>(
    arg.uploadMediaInfoList.map(duplicateCheck),
    socket
  );

  const newList = checkedList.filter(info => !info.existKey);

  const uploadFunc = async (info: CheckedInfo): Promise<void> => {
    let mediaFileId = "";

    // アップロード
    if (!info.existKey && info.rawInfo.dataLocation === "server") {
      mediaFileId = core.lib.makeKey() + path.extname(info.rawInfo.rawPath);
      const filePath = path.join(storageId, mediaFileId);
      const mediaData = info.rawInfo.arrayBuffer!;
      const m = mediaData.match(/^data:(.+);base64,/)
      if (m) {
        const contentType = m[1] || ''
        const buf = Buffer.from(info.rawInfo.arrayBuffer!.replace(m[0], ""),'base64')
        const data = {
          Key: info.rawInfo.key,
          ContentEncoding: 'base64',
          ContentType: contentType
        };
        await core.s3Client.putObject(core.bucket, filePath, buf, data);
      }
      // XXX 以下の方法だと、「https://~~」が「http:/~~」になってしまうことが判明したので、単純連結に変更
      // urlList.push(path.join(accessUrl, filePath));
      info.rawInfo.url = core.accessUrl + filePath;
    }

    info.rawInfo.mediaFileId = mediaFileId;
  };

  // 非同期処理を直列で実行していく
  await core.lib.gatlingAsync<void>(
    checkedList.map(uploadFunc),
    socket
  );

  // mediaListに追加
  if (newList.length) {
    await core.socketApi.dbApiInsert<MediaStore>(socket, {
      collectionSuffix: 'media-list',
      list: newList
        .map(data => ({
          ...arg.option,
          key: data.key,
          data: {
            name: data.rawInfo.name,
            rawPath: data.rawInfo.rawPath,
            hash: data.rawInfo.hash,
            mediaFileId: data.rawInfo.mediaFileId,
            tag: data.rawInfo.tag,
            url: data.rawInfo.url,
            urlType: data.rawInfo.urlType,
            iconClass: data.rawInfo.iconClass,
            imageSrc: data.rawInfo.imageSrc,
            dataLocation: data.rawInfo.dataLocation
          }
        })),
      share: "room",
      force: true
    }, true);
  }

  return checkedList.map(info => ({
    key: info.existKey || info.key,
    rawPath: info.rawInfo.rawPath,
    url: info.rawInfo.url,
    name: info.rawInfo.name,
    tag: info.rawInfo.tag,
    urlType: info.rawInfo.urlType
  }));
}
