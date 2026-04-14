const { app, BrowserWindow, desktopCapturer, ipcMain ,globalShortcut} = require("electron")
const { mouse, keyboard, Point, Button, Key} = require('@nut-tree-fork/nut-js')

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

function toNutKey(eventKey) {
  
  if (eventKey.length === 1) return eventKey;

  const map = {

    "Control":     Key.LeftControl,
    "Alt":         Key.LeftAlt,
    "Shift":       Key.LeftShift,
    "Meta":        Key.LeftSuper,
    "Enter":       Key.Enter,
    "Tab":         Key.Tab,
    "Escape":      Key.Escape,
    "Backspace":   Key.Backspace,
    "Delete":      Key.Delete,
    "Home":        Key.Home,
    "End":         Key.End,
    "PageUp":      Key.PageUp,
    "PageDown":    Key.PageDown,
    " ":           Key.Space,
    "ArrowUp":     Key.Up,
    "ArrowDown":   Key.Down,
    "ArrowLeft":   Key.Left,
    "ArrowRight":  Key.Right,
    "CapsLock":    Key.CapsLock,
    "Insert":      Key.Insert,
    "PrintScreen": Key.Print,
    "ScrollLock":  Key.ScrollLock,
    "Pause":       Key.Pause,
    "NumLock":     Key.NumLock,

    "F1":  Key.F1,  "F2":  Key.F2,  "F3":  Key.F3,  "F4":  Key.F4,
    "F5":  Key.F5,  "F6":  Key.F6,  "F7":  Key.F7,  "F8":  Key.F8,
    "F9":  Key.F9,  "F10": Key.F10, "F11": Key.F11, "F12": Key.F12,
  
  };

  return map[eventKey] ?? null;

}

async function buttonPress(release, input, isKeyboard) {

  if (isKeyboard == false) {

    if (release == false) {

      await mouse.pressButton(input);

    } else {

      await mouse.releaseButton(input);

    }
  
  } else {

    const key = toNutKey(input);

    if (key == null) {
      key = Key[input];
    }

    if (key !== null) {

      if (release == false) {

        await keyboard.pressKey(key);

      } else {

        await keyboard.releaseKey(key);

      }
    
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

            mouse.scrollUp(Math.floor(Math.abs(info.scrollDistanc)));

          } else if (info.scrollDistance > 0) {

            mouse.scrollDown(Math.floor(info.scrollDistance));

          }

        }
      
      } else if (info.inputType == "key") {

        await buttonPress(info.release, info.keyType, true);

      }

  });

});