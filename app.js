const sampleDataset = [
  {
    title: "静夜思",
    author: "李白",
    content: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  },
  {
    title: "春晓",
    author: "孟浩然",
    content: "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。",
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    content: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  },
];

const datasetInput = document.querySelector("#datasetInput");
const datasetStatus = document.querySelector("#datasetStatus");
const loadSampleButton = document.querySelector("#loadSampleButton");
const addRuleButton = document.querySelector("#addRuleButton");
const searchButton = document.querySelector("#searchButton");
const resultCount = document.querySelector("#resultCount");
const resultList = document.querySelector("#resultList");
const ruleList = document.querySelector("#ruleList");
const ruleTemplate = document.querySelector("#ruleTemplate");

function addRule(initialKeyword = "", initialPosition = "") {
  const fragment = ruleTemplate.content.cloneNode(true);
  const ruleItem = fragment.querySelector(".rule-item");
  const keywordInput = fragment.querySelector(".keyword-input");
  const positionInput = fragment.querySelector(".position-input");
  const removeButton = fragment.querySelector(".remove-button");

  keywordInput.value = initialKeyword;
  positionInput.value = initialPosition;

  removeButton.addEventListener("click", () => {
    ruleItem.remove();
  });

  ruleList.appendChild(fragment);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "");
}

function splitContentToLines(content) {
  return normalizeText(content)
    .split(/[，。！？；、]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDataset(rawInput) {
  const parsed = JSON.parse(rawInput);
  if (!Array.isArray(parsed)) {
    throw new Error("数据必须是 JSON 数组");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 条数据不是对象`);
    }

    const title = String(item.title || "").trim();
    const author = String(item.author || "").trim();
    const content = String(item.content || "").trim();

    if (!title || !author || !content) {
      throw new Error(`第 ${index + 1} 条数据缺少 title、author 或 content`);
    }

    return { title, author, content };
  });
}

function getSelectedFields() {
  return [...document.querySelectorAll('input[name="searchField"]:checked')].map(
    (input) => input.value,
  );
}

function getLineLengthFilter() {
  return document.querySelector('input[name="lineLength"]:checked').value;
}

function getRules() {
  return [...ruleList.querySelectorAll(".rule-item")]
    .map((item) => {
      const keyword = item.querySelector(".keyword-input").value.trim();
      const positionValue = item.querySelector(".position-input").value.trim();
      const position = positionValue ? Number(positionValue) : null;

      if (position !== null && (!Number.isInteger(position) || position < 1)) {
        throw new Error("字位必须是大于等于 1 的整数");
      }

      return {
        keyword,
        position,
      };
    })
    .filter((rule) => rule.keyword);
}

function matchRule(text, rule) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(rule.keyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (rule.position) {
    const startIndex = rule.position - 1;
    const targetSlice = normalizedText.slice(
      startIndex,
      startIndex + normalizedKeyword.length,
    );
    return targetSlice === normalizedKeyword;
  }

  return normalizedText.includes(normalizedKeyword);
}

function matchField(text, rules) {
  return rules.every((rule) => matchRule(text, rule));
}

function searchDataset(dataset, fields, lineLengthFilter, rules) {
  if (!fields.length) {
    throw new Error("请至少选择一个检索范围");
  }

  if (!rules.length) {
    throw new Error("请至少填写一个关键词");
  }

  return dataset
    .map((poem) => {
      const matches = [];

      if (fields.includes("title") && matchField(poem.title, rules)) {
        matches.push({ type: "标题", value: poem.title });
      }

      if (fields.includes("author") && matchField(poem.author, rules)) {
        matches.push({ type: "作者", value: poem.author });
      }

      if (fields.includes("content")) {
        const lines = splitContentToLines(poem.content);
        const matchedLines = lines.filter((line) => {
          if (lineLengthFilter !== "all" && line.length !== Number(lineLengthFilter)) {
            return false;
          }

          return matchField(line, rules);
        });

        if (matchedLines.length) {
          matches.push({ type: "诗句", value: matchedLines });
        }
      }

      return {
        ...poem,
        matches,
      };
    })
    .filter((poem) => poem.matches.length > 0);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderResults(results) {
  resultCount.textContent = `${results.length} 条结果`;

  if (!results.length) {
    resultList.innerHTML =
      '<div class="empty-state">没有匹配结果，可以调整关键词、字段或句式条件再试试。</div>';
    return;
  }

  resultList.innerHTML = results
    .map((poem) => {
      const chips = poem.matches
        .map((match) => `<span class="match-chip">${escapeHtml(match.type)}命中</span>`)
        .join("");

      const matchedLines = poem.matches
        .filter((match) => match.type === "诗句")
        .flatMap((match) => match.value)
        .map((line) => `<p class="matched-line">${escapeHtml(line)}</p>`)
        .join("");

      return `
        <article class="result-card">
          <h3>${escapeHtml(poem.title)}</h3>
          <div class="meta">${escapeHtml(poem.author)}</div>
          <div>${chips}</div>
          <div class="content-block">${escapeHtml(poem.content)}</div>
          ${matchedLines ? `<div class="content-block"><strong>命中诗句：</strong>${matchedLines}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function updateDatasetStatus(count) {
  datasetStatus.textContent = `已导入 ${count} 首诗词`;
}

function handleSearch() {
  try {
    const dataset = parseDataset(datasetInput.value.trim());
    const fields = getSelectedFields();
    const lineLengthFilter = getLineLengthFilter();
    const rules = getRules();
    const results = searchDataset(dataset, fields, lineLengthFilter, rules);

    updateDatasetStatus(dataset.length);
    renderResults(results);
  } catch (error) {
    resultCount.textContent = "0 条结果";
    resultList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

loadSampleButton.addEventListener("click", () => {
  datasetInput.value = JSON.stringify(sampleDataset, null, 2);
  updateDatasetStatus(sampleDataset.length);
});

addRuleButton.addEventListener("click", () => addRule());
searchButton.addEventListener("click", handleSearch);

addRule("明月", "");
