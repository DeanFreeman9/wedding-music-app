const songList = document.getElementById("songList");
const player = document.getElementById("player");

const tabsHeader = document.getElementById("tabsHeader");
const tabsLeft = document.getElementById("tabsLeft");
const tabsRight = document.getElementById("tabsRight");

const nowTitle = document.getElementById("nowTitle");
const nowFile = document.getElementById("nowFile");

const playPause = document.getElementById("playPause");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const progress = document.getElementById("progress");
const currentTimeText = document.getElementById("currentTime");
const durationText = document.getElementById("duration");

const addPanel = document.getElementById("addPanel");
const addBtn = document.getElementById("addBtn");
const closeAdd = document.getElementById("closeAdd");
const addSong = document.getElementById("addSong");
const fileInput = document.getElementById("fileInput");
const titleInput = document.getElementById("titleInput");
const categoryInput = document.getElementById("categoryInput");
const addPanelTitle = document.getElementById("addPanelTitle");

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettings = document.getElementById("closeSettings");
const settingsPlaylistName = document.getElementById("settingsPlaylistName");
const settingsAddPlaylist = document.getElementById("settingsAddPlaylist");
const settingsPlaylistList = document.getElementById("settingsPlaylistList");

const fadeOutBtn = document.getElementById("fadeOutBtn");
const fadeTime = document.getElementById("fadeTime");

let playlistOrder = ["Speeches", "In-Between", "Dinner", "Dance", "Kids"];
let currentCategory = "Speeches";
let songs = [];

let currentIndex = -1;
let draggedIndex = null;
let draggedPlaylistIndex = null;
let fadeTimeout = null;
let volumeFadeInterval = null;

let audioContext = null;
let audioSource = null;
let gainNode = null;

document.addEventListener("drive-ready", async () => {
  const data = await loadPlaylistDataFromDrive();

  playlistOrder = data.playlistOrder || playlistOrder;
  songs = data.songs || [];

  if (!playlistOrder.includes("Speeches")) {
    playlistOrder.unshift("Speeches");
  }

  playlistOrder = ["Speeches", ...playlistOrder.filter(p => p !== "Speeches")];

  renderTabs();
  renderCategoryOptions();
  renderSettingsPlaylists();
  renderSongs();
});

async function saveData() {
  await savePlaylistDataToDrive({
    playlistOrder,
    songs
  });
}

function setupAudioFade() {
  if (audioContext) return;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioSource = audioContext.createMediaElementSource(player);
  gainNode = audioContext.createGain();

  audioSource.connect(gainNode);
  gainNode.connect(audioContext.destination);

  gainNode.gain.value = 1;
}

function resetFade() {
  clearTimeout(fadeTimeout);
  clearInterval(volumeFadeInterval);

  player.volume = 1;

  if (gainNode && audioContext) {
    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.value = 1;
  }

  fadeOutBtn.textContent = "Fade Out";
}

function renderTabs() {
  tabsHeader.innerHTML = "";

  playlistOrder.forEach(category => {
    const tab = document.createElement("button");
    tab.className = category === currentCategory ? "tab active" : "tab";
    tab.textContent = category;

    tab.addEventListener("click", () => {
      currentCategory = category;
      renderTabs();
      renderSongs();
    });

    tabsHeader.appendChild(tab);
  });
}

function renderCategoryOptions() {
  categoryInput.innerHTML = "";

  playlistOrder.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryInput.appendChild(option);
  });
}

function renderSettingsPlaylists() {
  settingsPlaylistList.innerHTML = "";

  playlistOrder.forEach((category, index) => {
    const row = document.createElement("div");
    row.className = "settings-playlist-row";
    row.draggable = category !== "Speeches";

    row.innerHTML = `
      <span class="settings-drag">${category === "Speeches" ? "🔒" : "☰"}</span>
      <span>${category}</span>
      ${category !== "Speeches" ? `<button class="remove-playlist">Remove</button>` : ""}
    `;

    row.addEventListener("dragstart", () => {
      if (category !== "Speeches") {
        draggedPlaylistIndex = index;
      }
    });

    row.addEventListener("dragover", e => e.preventDefault());

    row.addEventListener("drop", async () => {
      if (draggedPlaylistIndex === null || index === 0) return;

      const moved = playlistOrder.splice(draggedPlaylistIndex, 1)[0];
      playlistOrder.splice(index, 0, moved);

      playlistOrder = ["Speeches", ...playlistOrder.filter(p => p !== "Speeches")];

      draggedPlaylistIndex = null;

      await saveData();

      renderTabs();
      renderCategoryOptions();
      renderSettingsPlaylists();
    });

    const removeBtn = row.querySelector(".remove-playlist");

    if (removeBtn) {
      removeBtn.addEventListener("click", async () => {
        if (!confirm(`Remove "${category}" and all songs inside it?`)) return;

        playlistOrder = playlistOrder.filter(p => p !== category);
        songs = songs.filter(song => song.category !== category);

        if (currentCategory === category) {
          currentCategory = "Speeches";
        }

        await saveData();

        renderTabs();
        renderCategoryOptions();
        renderSettingsPlaylists();
        renderSongs();
      });
    }

    settingsPlaylistList.appendChild(row);
  });
}

settingsAddPlaylist.addEventListener("click", async () => {
  const name = settingsPlaylistName.value.trim();

  if (!name) return alert("Enter playlist name.");
  if (playlistOrder.includes(name)) return alert("Playlist already exists.");

  playlistOrder.push(name);
  currentCategory = name;
  settingsPlaylistName.value = "";

  await saveData();

  renderTabs();
  renderCategoryOptions();
  renderSettingsPlaylists();
  renderSongs();
});

function getSongTitleFromFile(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function getAudioDuration(file) {
  return new Promise(resolve => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);

    audio.addEventListener("loadedmetadata", () => {
      resolve(formatTime(audio.duration));
    });

    audio.addEventListener("error", () => {
      resolve("00:00");
    });
  });
}

function renderSongs() {
  songList.innerHTML = "";

  songs
    .filter(song => song.category === currentCategory)
    .forEach(song => {
      const realIndex = songs.indexOf(song);
      const item = document.createElement("div");

      item.draggable = true;
      item.className = currentCategory === "Speeches" ? "song-card" : "song-row";

      if (currentCategory === "Speeches") {
        item.innerHTML = `
          <div class="song-info">
            <strong>${song.title}</strong>
            <span>${getSongTitleFromFile(song.fileName)} (${song.duration})</span>
          </div>
          <button class="remove-x">X</button>
        `;
      } else {
        item.innerHTML = `
          <span class="drag">☰</span>
          <div class="song-info">
            <strong>${getSongTitleFromFile(song.fileName)}</strong>
            <span>${song.duration}</span>
          </div>
          <button class="remove-x">X</button>
        `;
      }

      item.addEventListener("click", e => {
        if (e.target.classList.contains("remove-x")) {
          removeSong(realIndex);
          return;
        }

        currentIndex = realIndex;
        playSong(currentIndex);
      });

      item.addEventListener("dragstart", () => {
        draggedIndex = realIndex;
      });

      item.addEventListener("dragover", e => {
        e.preventDefault();
      });

      item.addEventListener("drop", async () => {
        if (draggedIndex === null || draggedIndex === realIndex) return;

        const moved = songs.splice(draggedIndex, 1)[0];
        songs.splice(realIndex, 0, moved);

        draggedIndex = null;

        await saveData();
        renderSongs();
      });

      songList.appendChild(item);
    });
}

async function removeSong(index) {
  if (!confirm(`Remove "${songs[index].title}"?`)) return;

  songs.splice(index, 1);
  await saveData();
  renderSongs();
}

addSong.addEventListener("click", async () => {
  const category = categoryInput.value;
  const files = Array.from(fileInput.files);

  if (!files.length) return alert("Choose song files.");

  if (category === "Speeches" && !titleInput.value.trim()) {
    return alert("Add button text for speech.");
  }

  for (const file of files) {
    const uploaded = await uploadSongToDrive(file);
    const duration = await getAudioDuration(file);

    songs.push({
      id: Date.now() + Math.random().toString(36),
      category,
      title: category === "Speeches" ? titleInput.value.trim() : getSongTitleFromFile(file.name),
      fileName: file.name,
      driveFileId: uploaded.driveFileId,
      duration
    });

    if (category === "Speeches") break;
  }

  await saveData();

  titleInput.value = "";
  fileInput.value = "";
  addPanel.classList.add("hidden");

  renderSongs();
});

async function playSong(index) {
  const song = songs[index];
  if (!song) return;

  const audioUrl = await getDriveAudioUrl(song.driveFileId);

  resetFade();

  player.src = audioUrl;
  player.volume = 1;
  player.currentTime = 0;

  try {
    setupAudioFade();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.value = 1;
  } catch (error) {
    console.log("Web Audio setup failed:", error);
  }

  try {
    await player.play();
  } catch (error) {
    console.log("Playback error:", error);
  }

  nowTitle.textContent =
    song.category === "Speeches" ? song.title : getSongTitleFromFile(song.fileName);

  nowFile.textContent =
    song.category === "Speeches"
      ? `${getSongTitleFromFile(song.fileName)} (${song.duration})`
      : song.duration;

  playPause.textContent = "Ⅱ";
}

addBtn.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  categoryInput.value = currentCategory;

  if (currentCategory === "Speeches") {
    titleInput.style.display = "block";
    titleInput.placeholder = "Button text e.g. Dean Speech";
    fileInput.multiple = false;
    addPanelTitle.textContent = "Add Speech Button";
  } else {
    titleInput.style.display = "none";
    fileInput.multiple = true;
    addPanelTitle.textContent = "Add Playlist Songs";
  }

  addPanel.classList.remove("hidden");
});

closeAdd.addEventListener("click", () => {
  addPanel.classList.add("hidden");
});

settingsBtn.addEventListener("click", () => {
  addPanel.classList.add("hidden");
  settingsPanel.classList.remove("hidden");
});

closeSettings.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

tabsLeft.addEventListener("click", () => {
  tabsHeader.scrollBy({ left: -150, behavior: "smooth" });
});

tabsRight.addEventListener("click", () => {
  tabsHeader.scrollBy({ left: 150, behavior: "smooth" });
});

playPause.addEventListener("click", async () => {
  if (!player.src) return;

  try {
    setupAudioFade();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  } catch (error) {
    console.log("Audio context not available:", error);
  }

  if (player.paused) {
    try {
      await player.play();
      playPause.textContent = "Ⅱ";
    } catch (error) {
      console.log("Playback error:", error);
    }
  } else {
    player.pause();
    playPause.textContent = "▶";
  }
});

next.addEventListener("click", () => {
  moveSong(1);
});

prev.addEventListener("click", () => {
  moveSong(-1);
});

function moveSong(direction) {
  const list = songs.filter(song => song.category === currentCategory);
  const current = songs[currentIndex];
  const indexInList = list.indexOf(current);
  const nextSong = list[indexInList + direction];

  if (!nextSong) return;

  currentIndex = songs.indexOf(nextSong);
  playSong(currentIndex);
}

fadeOutBtn.addEventListener("click", async () => {
  if (!player.src || player.paused) return;

  clearTimeout(fadeTimeout);
  clearInterval(volumeFadeInterval);

  try {
    setupAudioFade();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  } catch (error) {
    console.log("Audio fade setup failed:", error);
  }

  const fadeDurationMs = Number(fadeTime.value);
  const steps = 40;
  let currentStep = 0;

  fadeOutBtn.textContent = `Fading ${fadeDurationMs / 1000}s...`;

  const startGain = gainNode ? gainNode.gain.value : 1;
  const startVolume = player.volume || 1;
  const stepTime = fadeDurationMs / steps;

  volumeFadeInterval = setInterval(() => {
    currentStep++;

    const fadeAmount = currentStep / steps;
    const newLevel = Math.max(0, 1 - fadeAmount);

    if (gainNode) {
      gainNode.gain.value = startGain * newLevel;
    }

    player.volume = startVolume * newLevel;

    if (currentStep >= steps) {
      clearInterval(volumeFadeInterval);

      player.pause();
      player.currentTime = 0;
      player.volume = 1;

      if (gainNode) {
        gainNode.gain.value = 1;
      }

      fadeOutBtn.textContent = "Fade Out";
      playPause.textContent = "▶";
    }
  }, stepTime);
});

player.addEventListener("timeupdate", () => {
  if (player.duration) {
    progress.value = (player.currentTime / player.duration) * 100;
    currentTimeText.textContent = formatTime(player.currentTime);
    durationText.textContent = formatTime(player.duration);
  }
});

progress.addEventListener("input", () => {
  if (player.duration) {
    player.currentTime = (progress.value / 100) * player.duration;
  }
});

player.addEventListener("ended", () => {
  playPause.textContent = "▶";

  if (currentCategory !== "Speeches") {
    moveSong(1);
  }
});
