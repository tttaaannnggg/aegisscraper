const { Builder, By } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fsp = require("fs").promises;

const sleep = (ms) => {
  return new Promise((resolve) => {
    console.log(`waiting for ${Math.floor(ms / 1000)}s`);
    setTimeout(resolve, ms);
  });
};

const logAction = (text) => {
  const currentDate = new Date();
  const hours = currentDate.getHours();
  const minutes = currentDate.getMinutes();
  console.log(`[ACTION]: ${hours}:${minutes} - ${text}`);
};

const createNavigateAction = (driver) => async () => {
  logAction("navigating to main form");
  // aegis doesn't let you go directly to patient login
  await driver.get("https://clientportal.aegislabs.com/Home/Login");
  const patientLink = await driver.findElement(By.id("patcov"));
  await patientLink.click();
};

const createHandleFormAction =
  (driver) =>
  async ({ num, date }) => {
    logAction("filling form");
    //get form fields and submit button
    const reqNumberField = await driver.findElement(By.id("labid"));
    const sampleDateField = await driver.findElement(By.id("dateofservice"));
    const submitButton = await driver.findElement(By.id("btnFindSample"));

    //enter data into form fields
    await reqNumberField.sendKeys(num);
    await sampleDateField.sendKeys(date);
    await sleep(Math.random() * 10000);
    await submitButton.click();
  };

const createGetResultAction = (driver) => async () => {
  logAction("getting results");
  //get result message
  const resultElement = await driver.findElement(By.id("covMessage"));
  const covidMessage = await resultElement.getText();
  return covidMessage;
};

const createHandleResultAction = (driver) => async (result) => {
  console.log("[RESULT]: RESULT FOUND. PLEASE CHECK BROWSER FOR MORE INFO");
  console.log("POSSIBLE RESULT TEXT:");
  console.log(result);
  const image = await driver.takeScreenshot();
  await fsp.writeFile("result.png", image, "base64");
  process.exit();
};

const setupActions = async () => {
  console.log("setting up");
  let options = new chrome.Options();
  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  const navigate = createNavigateAction(driver);
  const handleForm = createHandleFormAction(driver);
  const getResult = createGetResultAction(driver);
  const handleResult = createHandleResultAction(driver);

  return {
    navigate,
    handleForm,
    getResult,
    handleResult,
  };
};

const main = async () => {
  const [REQNUM, REQDATE] = process.argv.slice(2); // cli input args should be <reqnum> <reqdate>
  const actions = await setupActions();
  let retryCount = 0;
  let notFoundMatches;
  let processingMatches;
  let finishedMatches;
  let result;
  do {
    retryCount++;
    console.log(
      `\n=============================== ATTEMPT ${retryCount} ===============================`
    );
    await actions.navigate();
    await actions.handleForm({ num: REQNUM, date: REQDATE });
    await sleep(1000);
    result = await actions.getResult();
    notFoundMatches = result.match(
      `Sample ${REQNUM} has not been received at our laboratory`
    );
    processingMatches = result.match(
      `Sample ${REQNUM} has been received and testing is in progress`
    );
    finishedMatches = result.match(
      `Sample ${REQNUM} was found and testing is complete. Enter the following as they appear on the requisition.`
    );

    if (notFoundMatches?.length) {
      console.log(
        `[STATUS]: Sample ${REQNUM} has not been received at our laboratory`
      );
    }
    if (processingMatches?.length) {
      console.log(
        `[STATUS]: Sample ${REQNUM} has been received and testing is in progress`
      );
    }

    if (!finishedMatches.length) {
      const retryTime = 1200000 + Math.random() * 60000;
      const nextRetry = new Date(Date.now() + retryTime);
      console.log(`scheduling retry for ${nextRetry}`);
      await sleep(retryTime);
      logAction(`retrying`);
    }
  } while (notFoundMatches?.length || processingMatches?.length);

  await actions.handleResult(result);
};

main();
