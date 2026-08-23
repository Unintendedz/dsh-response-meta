// Mid-thinking interruption test: let reasoning stream for a few seconds,
// then stop, and wait for the aborted readout including the reasoning extent.
async page => {
  await page.getByRole('button', { name: '新建会话' }).first().click();
  const composer = page.getByRole('textbox', { name: '描述你想要构建的内容' });
  await composer.fill('Explain step by step the design of a distributed key-value store with strong consistency: CAP, Paxos vs Raft, read repair, hinted handoff, quorum reads/writes, and then write a 1000-word essay summarizing all of it.');
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.waitForTimeout(6000);
  const stop = page.getByRole('button', { name: '停止生成' });
  await stop.waitFor({ state: 'visible', timeout: 15000 });
  await stop.click();
  await page.waitForSelector('[data-dsh-response-meta="aborted"]', { timeout: 30000 });
  return JSON.stringify(await page.locator('[data-dsh-response-meta="aborted"]').allTextContents());
}
