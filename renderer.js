const message = document.getElementById('message');
const buttons = new Map([...document.querySelectorAll('button[data-module]')].map((button) => [button.dataset.module, button]));

function setModuleStatus(name, status) {
  const dot = document.getElementById(`${name}-dot`);
  const label = document.getElementById(`${name}-status`);
  const button = buttons.get(name);
  if (!dot || !label || !button) return;
  const ready = Boolean(status?.ready);
  dot.className = ready ? 'ready' : 'missing';
  label.textContent = status?.detail || (ready ? 'พร้อมใช้งาน' : 'ไม่พร้อมใช้งาน');
  button.disabled = !ready;
}

async function refreshStatus() {
  try {
    const statuses = await window.homeHospital.status();
    for (const name of ['vaccine', 'ua-online']) setModuleStatus(name, statuses[name]);
  } catch (error) {
    console.error('Status check failed:', error);
    message.textContent = 'ตรวจสอบสถานะระบบไม่สำเร็จ';
  }
}

for (const [name, button] of buttons) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    message.textContent = 'กำลังเปิดระบบ...';
    try {
      const result = await window.homeHospital.launch(name);
      message.textContent = result.message;
    } catch (error) {
      console.error(`Launch failed for ${name}:`, error);
      message.textContent = 'เปิดระบบไม่สำเร็จ';
    } finally {
      setTimeout(refreshStatus, 800);
    }
  });
}
refreshStatus();
