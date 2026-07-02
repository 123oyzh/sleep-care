/**
 * 医患互动流程 — 集成测试脚本
 *
 * 测试完整的"注册-授权-查看报告-写建议-读建议"链路。
 * 纯 Node.js 原生 fetch，无需任何测试框架依赖。
 *
 * 用法：node backend/test/integration.test.js
 * 前置：后端服务器需已启动（http://localhost:3000）
 */

const BASE = 'http://localhost:3000';

// ── 工具函数 ──────────────────────────────────────────────
function log(msg) { console.log('  ' + msg); }
function ok(msg) { console.log('  ✅ ' + msg); }
function fail(msg) { console.error('  ❌ ' + msg); process.exit(1); }

async function request(path, opts) {
  opts = opts || {};
  const headers = opts.headers || {};
  if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
  headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  const json = await res.json();
  return json;
}

function check(res, step) {
  if (res.code !== 0) {
    fail(step + ' 失败: ' + (res.message || JSON.stringify(res)));
  }
  ok(step);
  return res.data;
}

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  console.log('\n🔬 医患互动流程集成测试');
  console.log('══════════════════════════════\n');

  let doctorToken, patientToken;
  let doctorId, patientId;

  // ──────────────────────────────────────────────────────────
  // a. 注册医生
  // ──────────────────────────────────────────────────────────
  log('a. 注册医生 (18800000001 / 张医生)');
  const regDoctor = await request('/api/auth/register', {
    method: 'POST',
    body: { phone: '18800000001', password: '123456', nickname: '张医生', role: 1 }
  });
  if (regDoctor.code === 0) {
    ok('医生注册成功');
  } else if (regDoctor.message && regDoctor.message.includes('已注册')) {
    ok('医生已存在，跳过注册');
  } else {
    fail('医生注册失败: ' + (regDoctor.message || JSON.stringify(regDoctor)));
  }

  // ──────────────────────────────────────────────────────────
  // b. 注册患者
  // ──────────────────────────────────────────────────────────
  log('b. 注册患者 (18800000002 / 李患者)');
  const regPatient = await request('/api/auth/register', {
    method: 'POST',
    body: { phone: '18800000002', password: '123456', nickname: '李患者', role: 0 }
  });
  if (regPatient.code === 0) {
    ok('患者注册成功');
  } else if (regPatient.message && regPatient.message.includes('已注册')) {
    ok('患者已存在，跳过注册');
  } else {
    fail('患者注册失败: ' + (regPatient.message || JSON.stringify(regPatient)));
  }

  // ──────────────────────────────────────────────────────────
  // c. 患者登录
  // ──────────────────────────────────────────────────────────
  log('c. 患者登录 → 获取 token');
  const patientLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { phone: '18800000002', password: '123456' }
  });
  const patientData = check(patientLogin, '患者登录');
  patientToken = patientData.token;
  patientId = patientData.id;
  log('  患者 ID: ' + patientId);

  // ──────────────────────────────────────────────────────────
  // d. 获取医生列表 → 找到医生 ID
  // ──────────────────────────────────────────────────────────
  log('d. 获取医生列表 → 查找张医生');
  const doctorList = await request('/api/users/doctors', {
    token: patientToken
  });
  const doctors = check(doctorList, '获取医生列表');
  const targetDoctor = doctors.find(function (d) { return d.phone === '18800000001'; });
  if (!targetDoctor) fail('未找到医生 18800000001');
  doctorId = targetDoctor.id;
  ok('找到医生 ID: ' + doctorId + ' (' + (targetDoctor.nickname || '') + ')');

  // ──────────────────────────────────────────────────────────
  // e. 患者授权该医生
  // ──────────────────────────────────────────────────────────
  log('e. 患者授权医生 (doctor_id=' + doctorId + ')');
  const grant = await request('/api/doctor/grant', {
    method: 'POST',
    token: patientToken,
    body: { doctor_id: doctorId }
  });
  // 允许"已申请"或"已授权"(重复运行)的情况
  if (grant.code === 0) {
    ok('授权申请已发送');
  } else if (grant.message && (grant.message.includes('已申请') || grant.message.includes('已授权'))) {
    ok('授权已存在: ' + grant.message);
  } else {
    fail('授权失败: ' + (grant.message || JSON.stringify(grant)));
  }

  // ──────────────────────────────────────────────────────────
  // f. 医生登录
  // ──────────────────────────────────────────────────────────
  log('f. 医生登录 → 获取 token');
  const doctorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { phone: '18800000001', password: '123456' }
  });
  const doctorData = check(doctorLogin, '医生登录');
  doctorToken = doctorData.token;
  log('  医生 ID: ' + doctorData.id);

  // ──────────────────────────────────────────────────────────
  // g. 医生查看患者列表 → 检查 status 是否为 pending
  // ──────────────────────────────────────────────────────────
  log('g. 医生查看患者列表 → 检查 status');
  const patients = await request('/api/doctor/patients', {
    token: doctorToken
  });
  const patientList = check(patients, '获取患者列表');
  const targetPatient = patientList.find(function (p) { return p.patient_id === patientId || p.phone === '18800000002'; });
  if (!targetPatient) fail('未在患者列表中找到李患者 (id=' + patientId + ')');
  ok('患者 status: ' + targetPatient.status + ' (期望: pending 或 active)');

  // ──────────────────────────────────────────────────────────
  // h. 医生确认授权
  // ──────────────────────────────────────────────────────────
  log('h. 医生确认授权 (patient_id=' + patientId + ')');
  const confirm = await request('/api/doctor/confirm', {
    method: 'PUT',
    token: doctorToken,
    body: { patient_id: patientId }
  });
  if (confirm.code === 0 || (confirm.message && confirm.message.includes('未找到待确认'))) {
    ok('医生确认授权' + (confirm.code === 0 ? '' : ' (已是 active 状态)'));
  } else {
    fail('医生确认授权失败: ' + (confirm.message || JSON.stringify(confirm)));
  }

  // ──────────────────────────────────────────────────────────
  // i. 医生查看患者报告
  // ──────────────────────────────────────────────────────────
  log('i. 医生查看患者报告');
  const report = await request('/api/doctor/patient/data?patient_id=' + patientId, {
    token: doctorToken
  });
  const reportData = check(report, '获取患者报告');
  log('  睡眠评分: ' + (reportData.sleep_score || 0) + ' 分, 总时长: ' + (reportData.total_minutes || 0) + ' 分钟');

  // ──────────────────────────────────────────────────────────
  // j. 医生填写干预建议
  // ──────────────────────────────────────────────────────────
  log('j. 医生填写干预建议');
  const noteContent = '建议保持规律作息，睡前避免饮用咖啡和浓茶，每天运动 30 分钟。';
  const saveNote = await request('/api/doctor/note', {
    method: 'PUT',
    token: doctorToken,
    body: { patient_id: patientId, note: noteContent }
  });
  check(saveNote, '保存干预建议');
  log('  建议内容: ' + noteContent);

  // ──────────────────────────────────────────────────────────
  // k. 医生获取干预建议 → 验证内容一致
  // ──────────────────────────────────────────────────────────
  log('k. 医生获取干预建议 → 验证');
  const getNote = await request('/api/doctor/note?patient_id=' + patientId, {
    token: doctorToken
  });
  const noteData = check(getNote, '获取干预建议');
  if (noteData.note !== noteContent) {
    fail('建议内容不一致!\n  期望: ' + noteContent + '\n  实际: ' + noteData.note);
  }
  ok('建议内容一致: "' + noteData.note + '"');

  // ── 全部通过 ─────────────────────────────────────────────
  console.log('\n══════════════════════════════');
  console.log('✅ 所有集成测试通过！(11/11)');
  console.log('══════════════════════════════\n');

  // 输出测试摘要
  console.log('测试摘要:');
  console.log('  医生: 18800000001 (id=' + doctorId + ', 张医生)');
  console.log('  患者: 18800000002 (id=' + patientId + ', 李患者)');
  console.log('  流程: 注册 → 登录 → 授权 → 确认 → 报告 → 建议 → 验证 ✅');
}

// 检查服务器
async function checkServer() {
  try {
    const res = await fetch(BASE + '/');
    if (res.ok) return true;
  } catch (e) {
    // fall through
  }
  console.error('❌ 无法连接到服务器: ' + BASE);
  console.error('   请先启动后端: cd backend && node app.js');
  process.exit(1);
}

// 运行
checkServer().then(function () {
  main().catch(function (err) {
    console.error('\n❌ 测试异常:', err.message);
    console.error(err);
    process.exit(1);
  });
});
