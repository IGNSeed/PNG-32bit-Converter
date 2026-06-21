const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const convertButton = document.getElementById("convertBtn");
const clearButton = document.getElementById("clearBtn");
const summary = document.getElementById("summary");
const countValue = document.getElementById("countVal");
const doneValue = document.getElementById("doneVal");
const message = document.getElementById("message");

let selectedFiles = [];
let isConverting = false;

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  addFiles([...event.dataTransfer.files]);
});

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});

convertButton.addEventListener("click", convertFiles);
clearButton.addEventListener("click", clearFiles);

function addFiles(files) {
  const pngFiles = files.filter(isPngFile);

  if (pngFiles.length === 0) {
    showMessage("PNGファイルを選択してください。", "error");
    return;
  }

  for (const file of pngFiles) {
    const alreadyAdded = selectedFiles.some(
      (item) =>
        item.file.name === file.name &&
        item.file.size === file.size &&
        item.file.lastModified === file.lastModified
    );

    if (!alreadyAdded) {
      selectedFiles.push({
        file,
        status: "pending",
        element: null,
      });
    }
  }

  hideMessage();
  renderFileList();
}

function isPngFile(file) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

function renderFileList() {
  fileList.replaceChildren();

  selectedFiles.forEach((item) => {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";

    const fileName = document.createElement("div");
    fileName.className = "file-name";
    fileName.textContent = item.file.name;

    const fileSize = document.createElement("div");
    fileSize.className = "file-size";
    fileSize.textContent = formatFileSize(item.file.size);

    const fileStatus = document.createElement("span");
    fileStatus.className = `file-status status-${item.status}`;
    fileStatus.textContent = getStatusLabel(item.status);

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.setAttribute("aria-hidden", "true");

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progress.appendChild(progressBar);

    fileItem.append(fileName, fileSize, fileStatus, progress);
    fileList.appendChild(fileItem);

    item.element = fileItem;
  });

  updateSummary();
}

function updateSummary() {
  const hasFiles = selectedFiles.length > 0;

  summary.hidden = !hasFiles;
  clearButton.hidden = !hasFiles;
  convertButton.disabled = !hasFiles || isConverting;
  countValue.textContent = selectedFiles.length;
  doneValue.textContent = selectedFiles.filter(
    (item) => item.status === "done"
  ).length;
}

async function convertFiles() {
  isConverting = true;
  updateSummary();
  showMessage("変換しています...");

  let successCount = 0;
  let errorCount = 0;

  for (const item of selectedFiles) {
    if (item.status === "done") {
      continue;
    }

    setStatus(item, "processing");
    setProgress(item, 15);

    try {
      const blob = await convertToRgbaPng(item.file, (progress) => {
        setProgress(item, progress);
      });

      downloadBlob(blob, createOutputName(item.file.name));
      setProgress(item, 100);
      setStatus(item, "done");
      successCount += 1;
    } catch (error) {
      console.error(error);
      setStatus(item, "error");
      errorCount += 1;
    }

    updateSummary();
  }

  isConverting = false;
  updateSummary();

  if (errorCount > 0) {
    showMessage(
      `${successCount}件の変換が完了し、${errorCount}件でエラーが発生しました。`,
      "error"
    );
  } else {
    showMessage(`${successCount}件の変換が完了しました。`, "success");
  }
}

function convertToRgbaPng(file, onProgress) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvasを初期化できませんでした。");
        }

        context.drawImage(image, 0, 0);
        onProgress(50);

        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );
        context.putImageData(imageData, 0, 0);
        onProgress(80);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);

          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("PNGを生成できませんでした。"));
          }
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。"));
    };

    image.src = objectUrl;
  });
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function createOutputName(fileName) {
  return fileName.replace(/\.png$/i, "_32bit.png");
}

function setStatus(item, status) {
  item.status = status;

  const statusElement = item.element?.querySelector(".file-status");
  if (!statusElement) {
    return;
  }

  statusElement.className = `file-status status-${status}`;
  statusElement.textContent = getStatusLabel(status);
}

function setProgress(item, percentage) {
  const progressBar = item.element?.querySelector(".progress-bar");
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }
}

function getStatusLabel(status) {
  const labels = {
    pending: "待機中",
    processing: "変換中",
    done: "完了",
    error: "エラー",
  };

  return labels[status] ?? status;
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function clearFiles() {
  if (isConverting) {
    return;
  }

  selectedFiles = [];
  fileList.replaceChildren();
  hideMessage();
  updateSummary();
}

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = `message${type ? ` ${type}` : ""}`;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
  message.textContent = "";
  message.className = "message";
}
