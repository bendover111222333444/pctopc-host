const { app, dialog, BrowserWindow, desktopCapturer, ipcMain ,globalShortcut} = require("electron")
const { mouse, keyboard, Point, Button, Key} = require('@nut-tree-fork/nut-js')
const ffmpegPath = require('ffmpeg-static')
const { spawn } = require('child_process')
const net = require('net')

mouse.config.autoDelayMs = 0;

app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ipc-message-size-limit', '134217728')

let ffmpegProcess = null
let hostingWindow = null;
let tcpServer = null;

const screenCapSettings = {

    input: ['-f', 'lavfi'],
    source: ['-i', 'ddagrab=framerate=60:draw_mouse=1:0,hwdownload,format=bgra'],
    output: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p1',
        '-tune', 'll',
        '-zerolatency', '1',
        '-g', '60',
        '-forced-idr', '1',
        '-bf', '0',
        '-rc', 'cbr',
        '-b:v', '5M',
        '-bufsize', '1M',
        '-f', 'h264',
        'pipe:1'
    ]

}

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

  const map = {

    "0": Key.Num0, "1": Key.Num1, "2": Key.Num2,
    "3": Key.Num3, "4": Key.Num4, "5": Key.Num5,
    "6": Key.Num6, "7": Key.Num7, "8": Key.Num8,
    "9": Key.Num9,

    ".": Key.Period,
    ",": Key.Comma,
    "/": Key.Slash,
    ";": Key.Semicolon,
    "'": Key.Quote,
    "[": Key.LeftBracket,
    "]": Key.RightBracket,
    "\\": Key.Backslash,
    "`": Key.Grave,
    "-": Key.Minus,
    "=": Key.Equal,

    "!": Key.Num1,
    "@": Key.Num2,
    "#": Key.Num3,
    "$": Key.Num4,
    "%": Key.Num5,
    "^": Key.Num6,
    "&": Key.Num7,
    "*": Key.Num8,
    "(": Key.Num9,
    ")": Key.Num0,
    "_": Key.Minus,
    "+": Key.Equal,
    "{": Key.LeftBracket,
    "}": Key.RightBracket,
    "|": Key.Backslash,
    ":": Key.Semicolon,
    "\"": Key.Quote,
    "<": Key.Comma,
    ">": Key.Period,
    "?": Key.Slash,
    "~": Key.Grave,

    " ":           Key.Space,
    "Enter":       Key.Enter,
    "Tab":         Key.Tab,
    "Backspace":   Key.Backspace,
    "Delete":      Key.Delete,
    "Escape":      Key.Escape,

    "Control":     Key.LeftControl,
    "Alt":         Key.LeftAlt,
    "Shift":       Key.LeftShift,
    "Meta":        Key.LeftSuper,

    "Home":        Key.Home,
    "End":         Key.End,
    "PageUp":      Key.PageUp,
    "PageDown":    Key.PageDown,
    "ArrowUp":     Key.Up,
    "ArrowDown":   Key.Down,
    "ArrowLeft":   Key.Left,
    "ArrowRight":  Key.Right,
    "Insert":      Key.Insert,

    "CapsLock":    Key.CapsLock,
    "NumLock":     Key.NumLock,
    "ScrollLock":  Key.ScrollLock,

    "PrintScreen": Key.Print,
    "Pause":       Key.Pause,

    "F1":  Key.F1,  "F2":  Key.F2,  "F3":  Key.F3,  "F4":  Key.F4,
    "F5":  Key.F5,  "F6":  Key.F6,  "F7":  Key.F7,  "F8":  Key.F8,
    "F9":  Key.F9,  "F10": Key.F10, "F11": Key.F11, "F12": Key.F12,

  };

  if (map[eventKey] !== undefined) return map[eventKey];
  if (eventKey.length === 1) return Key[eventKey.toUpperCase()] ?? null;

  return null;
}

async function buttonPress(release, input, isKeyboard) {

  if (isKeyboard == false) {

    if (release == false) {

      await mouse.pressButton(input);

    } else {

      await mouse.releaseButton(input);

    }
  
  } else {

    let key = toNutKey(input);

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
  
  const { screen } = require("electron");

  createWindow();

  hostingWindow.on('close', (event) => {

    event.preventDefault();

    const choice = dialog.showMessageBoxSync(hostingWindow, {
      type: 'question',
      buttons: ['Yes', 'Cancel'],
      title: 'Confirm',
      message: 'Are you sure you want to quit?'
    });

    if (choice === 0) {

      hostingWindow.destroy();
    
    }

  });

  ipcMain.handle('start-capture', async (event) => {

      const args = [
        ...screenCapSettings.input,
        ...screenCapSettings.source,
        ...screenCapSettings.output
      ]

      tcpServer = net.createServer((socket) => {

          socket.on('error', () => {})

          ffmpegProcess = spawn(ffmpegPath, args)

          // debuging data only

          // ffmpegProcess.stderr.on('data', (data) => {

          //   console.log('ffmpeg:', data.toString())
          
          // })

          ffmpegProcess.stdout.pipe(socket)

      })

      tcpServer.listen(0, '127.0.0.1', () => {

          const port = tcpServer.address().port
          hostingWindow.webContents.send('tcp-port', port)

      })

  })

  ipcMain.handle('stop-capture', () => {

      if (ffmpegProcess) { ffmpegProcess.kill(); ffmpegProcess = null }
      if (tcpServer) { tcpServer.close(); tcpServer = null }
      
  })

  ipcMain.handle("screen-size", async () => {

    const display = screen.getPrimaryDisplay();
    const width = display.bounds.width * display.scaleFactor;
    const height = display.bounds.height * display.scaleFactor;

    return await {type: "screen-size", width: width, height: height}

  })

  ipcMain.handle("source", async () => {

    return await desktopCapturer.getSources({

        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 }

    })

  })

  screen.on("display-metrics-changed", () => {
    
    if (hostingWindow) {
        
      hostingWindow.webContents.send("display-changed");
    
    }

  });

  screen.on("display-removed", () => {
  
    if (hostingWindow) {
        
      hostingWindow.webContents.send("display-changed");
    
    }
  
  });

  globalShortcut.register("CommandOrControl+N", () => {
    
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

            mouse.scrollUp(Math.floor(Math.abs(info.scrollDistance)));

          } else if (info.scrollDistance > 0) {

            mouse.scrollDown(Math.floor(info.scrollDistance));

          }

        }
      
      } else if (info.inputType == "key") {

        await buttonPress(info.release, info.keyType, true);

      }

  });

});