import { test } from "./fixtures";
import { addArchive, addOwnPage, removeArchive, removeOwnPage, searchAndSeeOneList } from "./search-one-list";

// Safari at an iPhone's size: where the owner saw only a count of articles, under twenty results of their own.
test.describe("one ranked list on an iPhone", () => {
  test.describe.configure({ mode: "serial" });
  let own: string;
  test.beforeAll(async ({ request }) => {
    await addArchive(request);
    own = await addOwnPage(request);
  });
  test.afterAll(async ({ request }) => {
    await removeOwnPage(request, own);
    await removeArchive(request);
  });

  test("a reference article with every word in its title comes above a page that has them far apart", async ({ page }) => {
    await searchAndSeeOneList(page);
  });
});
