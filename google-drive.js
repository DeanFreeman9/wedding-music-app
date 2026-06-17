const CLIENT_ID = "82508160992-srcf72ap43hvpetp2akgdffk765i1ckv.apps.googleusercontent.com";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let gapiReady = false;
let gisReady = false;

let weddingFolderId = null;
let playlistFileId = null;

const WEDDING_FOLDER_NAME = "Wedding Music App";
const PLAYLIST_FILE_NAME = "playlists.json";

window.addEventListener("load", () => {
  const loginBtn = document.getElementById("loginBtn");
  const status = document.getElementById("status");

  loginBtn.disabled = true;
  status.textContent = "Loading Google...";

  gapi.load("client", async () => {
    await gapi.client.init({
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
      ]
    });

    gapiReady = true;
    maybeEnableLogin();
  });

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async tokenResponse => {
      if (tokenResponse.error) {
        console.error(tokenResponse);
        alert("Google sign in failed.");
        return;
      }

      status.textContent = "Signed in. Loading Drive...";
      await setupDrive();

      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("appScreen").classList.remove("hidden");

      document.dispatchEvent(new Event("drive-ready"));
    }
  });

  gisReady = true;
  maybeEnableLogin();

  loginBtn.addEventListener("click", () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
});

function maybeEnableLogin() {
  const loginBtn = document.getElementById("loginBtn");
  const status = document.getElementById("status");

  if (gapiReady && gisReady) {
    loginBtn.disabled = false;
    status.textContent = "Ready to sign in.";
  }
}

async function setupDrive() {
  weddingFolderId = await getOrCreateFolder(WEDDING_FOLDER_NAME);
  playlistFileId = await getOrCreatePlaylistFile();
}

async function getOrCreateFolder(folderName) {
  const response = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id,name)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  if (response.result.files.length > 0) {
    return response.result.files[0].id;
  }

  const createResponse = await gapi.client.drive.files.create({
    resource: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    },
    fields: "id"
  });

  return createResponse.result.id;
}

async function getOrCreatePlaylistFile() {
  const response = await gapi.client.drive.files.list({
    q: `'${weddingFolderId}' in parents and name='${PLAYLIST_FILE_NAME}' and trashed=false`,
    fields: "files(id,name)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  if (response.result.files.length > 0) {
    return response.result.files[0].id;
  }

  const defaultData = {
    playlistOrder: ["Speeches", "In-Between", "Dinner", "Dance", "Kids"],
    songs: []
  };

  const created = await uploadMultipartFile(
    {
      name: PLAYLIST_FILE_NAME,
      mimeType: "application/json",
      parents: [weddingFolderId]
    },
    JSON.stringify(defaultData, null, 2),
    "application/json"
  );

  return created.id;
}

async function loadPlaylistDataFromDrive() {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${playlistFileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${gapi.client.getToken().access_token}`
      }
    }
  );

  return await response.json();
}

async function savePlaylistDataToDrive(data) {
  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${playlistFileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${gapi.client.getToken().access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data, null, 2)
    }
  );
}

async function uploadSongToDrive(file) {
  const uploaded = await uploadMultipartFile(
    {
      name: file.name,
      mimeType: file.type || "audio/mpeg",
      parents: [weddingFolderId]
    },
    file,
    file.type || "audio/mpeg"
  );

  return {
    driveFileId: uploaded.id,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg"
  };
}

async function uploadMultipartFile(metadata, content, mimeType) {
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  let body;

  if (content instanceof File) {
    const fileBuffer = await content.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    const beforeFile = new TextEncoder().encode(
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n`
    );

    const afterFile = new TextEncoder().encode(closeDelimiter);

    body = new Uint8Array(beforeFile.length + fileBytes.length + afterFile.length);
    body.set(beforeFile, 0);
    body.set(fileBytes, beforeFile.length);
    body.set(afterFile, beforeFile.length + fileBytes.length);
  } else {
    body =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;
  }

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gapi.client.getToken().access_token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  return await response.json();
}

async function getDriveAudioUrl(fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${gapi.client.getToken().access_token}`
      }
    }
  );

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
