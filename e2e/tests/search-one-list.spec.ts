import { test } from "./fixtures";
import { addArchive, addOwnPage, removeArchive, removeOwnPage, searchAndSeeOneList } from "./search-one-list";

test.describe("one ranked list on a wide screen", () => {
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
