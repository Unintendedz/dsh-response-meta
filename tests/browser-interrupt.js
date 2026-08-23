// Interrupted-readout browser test: start a long-reasoning task, click the
// stop button as soon as it appears (typically during the thinking phase),
// then wait for the interrupted readout to render.
async page => {
  await page.getByRole('button', { name: '新建会话' }).first().click();
  const composer = page.getByRole('textbox', { name: '描述你想要构建的内容' });
  await composer.fill('Explain step by step the design of a distributed key-value store with strong consistency: CAP, Paxos vs Raft, read repair, hinted handoff, quorum reads/writes, and then write a 1000-word essay summarizing all of it.');
  await page.getByRole('button', { name: '发送消息' }).click();
  const stop = page.getByRole('button', { name: '停止生成' });
  await stop.waitFor({ state: 'visible', timeout: 30000 });
  await stop.click();
  await page.waitForSelector('[data-dsh-response-meta="aborted"]', { timeout: 30000 });
  const readouts = await page.locator('[data-dsh-response-meta="aborted"]').allTextContents();
  const stopTime = Date.now();
  // also capture whether reasoning text was already streaming when we stopped
  return JSON.stringify({ readouts, stopTime });
}
