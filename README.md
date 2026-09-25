# Home Hospital Platform

Desktop Launcher กลางสำหรับ Home Hospital โดย **ไม่รวม backend หรือฐานข้อมูลของระบบงานเข้าด้วยกัน**

## Architecture

Launcher มี seam เดียวสำหรับการเปิดโมดูลใน `modules.cjs`:

- **Vaccine adapter** ตรวจหาและเปิด VCHome Hospital เดิม
- **UA adapter** ตรวจหา Python/`app.py` และเปิด Streamlit เดิมบน `127.0.0.1:8501`
- `main.cjs` ดูแลเฉพาะ Electron window และ IPC
- `preload.cjs` เปิด interface ขนาดเล็กให้ renderer และใช้ allowlist ของชื่อโมดูล
- VaccineHomeBot และ UAReport ยังคง authentication, validation, database และ business logic ของตัวเองทั้งหมด

ไม่มีการย้าย Supabase, database schema, secrets หรือ clinical/business logic เข้ามาใน launcher

## Optional machine configuration

หากตำแหน่งโปรแกรมต่างจากค่ามาตรฐาน สามารถตั้ง environment variables ก่อนเปิด launcher:

- `VCHOME_EXE` — path ไปยัง `VCHome Hospital.exe`
- `UAREPORT_ROOT` — root ของ UAReport
- `UAREPORT_PYTHON` — path ไปยัง Python executable ของ UAReport

## Development

```powershell
npm install
npm run verify
npm start
```

UA Report ถูก bind เฉพาะ loopback (`127.0.0.1`) เพื่อไม่เปิด Streamlit รับจากเครื่องอื่นในเครือข่าย
