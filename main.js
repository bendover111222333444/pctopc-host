const { app, BrowserWindow, desktopCapturer, ipcMain ,globalShortcut} = require("electron")
const { mouse, keyboard, straightTo, Point, Button} = require('@nut-tree-fork/nut-js')

mouse.config.autoDelayMs = 0;

let hostingWindow = null;

const createWindow = () => {
    
    hostingWindow = new BrowserWindow({
        width: 600,
        height: 600,
        //resizable: false,
        icon: "./assets/goofyIcon.png",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    hostingWindow.loadFile('html/index.html');

}

async function buttonPress(release, input, isKeyboard) {

  if (isKeyboard == false) {

    if (release == false) {

      await mouse.pressButton(input);

    } else {

      await mouse.releaseButton(input);

    }
  
  } else {

    if (release == false) {

      await keyboard.pressKey(input);

    } else {

      await keyboard.releaseKey(input);

    }

  }

}

app.whenReady().then(() => {
  
  createWindow();
  
  ipcMain.handle("source", async () => {

      return await desktopCapturer.getSources({types: ["screen"]});

  });

  globalShortcut.register("CommandOrControl+M", () => {
    
    app.quit();

  });

  ipcMain.on("input", async (event, info) => {

      if (info.inputType == "moveMouse") {

        await mouse.setPosition(new Point(Math.floor(info.xPos),Math.floor(info.yPos)));

      } else if (info.inputType == "click") {

        if (info.clickType == 0) {

          await buttonPress(info.release, Button.LEFT, false);
        
        } else if (info.clickType == 1) {

          await buttonPress(info.release, Button.MIDDLE, false);

        } else if (info.clickType == 2) {
        
          await buttonPress(info.release, Button.RIGHT, false);

        } else if (info.clickType == 3) {

          if (info.scrollDistance < 0) {

            mouse.scrollDown(info.scrollDistance);

          } else if (info.scrollDistance > 0) {

            mouse.scrollUp(info.scrollDistance);

          }

        }
      
      } else if (info.inputType == "key") {

        await buttonPress(info.release, info.keyType, true);

      }

  });

});