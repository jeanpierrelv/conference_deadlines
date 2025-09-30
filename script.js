const conferences = [
  "aaai.yml",
  "aistats.yml",
  "esann.yml",
  "iclr.yml",
  "icml.yml",
  "ijcnn.yml",
  "icra.yml",
  "nips.yml",
  "cvpr.yml"
];

const baseUrl = "https://raw.githubusercontent.com/ccfddl/ccf-deadlines/main/conference/AI/";

async function loadConference(file) {
  const response = await fetch(baseUrl + file);
  const text = await response.text();
  return jsyaml.load(text);
}

function getLatestConf(confData) {
  if (!confData || !confData[0] || !confData[0].confs) return null;
  const confs = confData[0].confs;

  const today = new Date();
  const upcoming = confs
    .map(c => {
      const deadlineStr = c.timeline?.[0]?.deadline;
      return {
        ...c,
        deadline: deadlineStr ? new Date(deadlineStr.replace(" ", "T")) : null
      };
    })
    .filter(c => c.deadline && c.deadline >= today);

  if (upcoming.length > 0) {
    return upcoming.sort((a, b) => a.deadline - b.deadline)[0];
  }

  return confs[confs.length - 1];
}

async function renderTable() {
  const tbody = document.querySelector("#confTable tbody");
  tbody.innerHTML = "";

  let allConfs = [];

  for (const file of conferences) {
    try {
      const confData = await loadConference(file);
      const meta = confData[0];
      const latest = getLatestConf(confData);

      if (!latest) continue;

      allConfs.push({
        title: meta.title,
        description: meta.description,
        place: latest.place,
        date: latest.date,
        deadline: latest.deadline,
        deadlineStr: latest.timeline?.[0]?.deadline,
        link: latest.link
      });
    } catch (e) {
      console.error("Erro carregando", file, e);
    }
  }

  // Ordenar por data do deadline
  allConfs.sort((a, b) => a.deadline - b.deadline);

  // Criar linhas da tabela
  allConfs.forEach((conf, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${conf.description || conf.title}</td>
      <td>${conf.title}</td>
      <td>${conf.place || "-"}</td>
      <td>${conf.date || "-"}</td>
      <td class="deadline-cell" data-deadline="${conf.deadline}"></td>
      <td><a href="${conf.link}" target="_blank">🔗 site</a></td>
    `;
    tbody.appendChild(row);
  });

  // Iniciar contagem regressiva dinâmica
  startCountdown();
}

function startCountdown() {
  function updateCountdown() {
    const now = new Date();

    document.querySelectorAll(".deadline-cell").forEach(cell => {
      const deadline = new Date(cell.dataset.deadline);
      const diff = deadline - now;

      if (isNaN(deadline.getTime())) {
        cell.textContent = "-";
        return;
      }

      if (diff <= 0) {
        cell.textContent = "⏳ prazo encerrado";
        cell.style.color = "gray";
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const deadlineStr = deadline.toLocaleString();
      cell.innerHTML = `
      <div><strong>${deadlineStr}</strong></div>
      <div>${days}d ${hours}h ${mins}m ${secs}s</div>
      `;

      // Cores por urgência
      if (days < 7) cell.style.color = "red";
      else if (days < 30) cell.style.color = "orange";
      else cell.style.color = "green";
    });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

renderTable();