const { app, BrowserWindow, desktopCapturer, ipcMain } = require("electron")
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

app.whenReady().then(() => {
  createWindow()
  
  ipcMain.handle("source", async () => {

    return await desktopCapturer.getSources({types: ["screen"]});

  });

});