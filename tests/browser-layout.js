// Completed-message layout regression. Run against a loaded DSH page with
// playwright-cli run-code: the summary owns the second row, while the branch
// switcher follows the native create-branch button at the end of row one.
async page => {
  await page.waitForSelector('[data-dsh-response-meta="complete"]');
  const result = await page.evaluate(() => {
    const summary = document.querySelector('[data-dsh-response-meta="complete"]');
    const slot = summary?.closest('[data-slot$="assistant-actions"]');
    const actions = slot?.parentElement;
    const switcher = slot?.querySelector('.ct-branchNav');
    const createBranch = slot?.nextElementSibling;
    const firstAction = actions?.firstElementChild;
    if (!summary || !actions || !switcher || !createBranch || !firstAction) {
      throw new Error('completed-message layout fixtures missing');
    }
    const summaryRect = summary.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    const firstRect = firstAction.getBoundingClientRect();
    const switcherRect = switcher.getBoundingClientRect();
    const createRect = createBranch.getBoundingClientRect();
    return {
      summaryOnNextRow: summaryRect.top >= firstRect.bottom - 1,
      summaryFitsActionRow: summaryRect.left >= actionRect.left - 1 && summaryRect.right <= actionRect.right + 1,
      switcherAfterCreateBranch: switcherRect.left >= createRect.right - 1,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  if (!result.summaryOnNextRow) throw new Error('run summary is still on the button row');
  if (!result.summaryFitsActionRow || result.horizontalOverflow) throw new Error('run summary overflows the viewport');
  if (!result.switcherAfterCreateBranch) throw new Error('branch switcher is still before create-branch');
  return JSON.stringify(result);
}
