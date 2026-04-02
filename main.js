const { app, BrowserWindow } = require('electron')
let hostingWindow = null;

const createWindow = () => {
    hostingWindow = new BrowserWindow({
        width: 300,
        height: 200,
        resizable: false,
        icon: "./assets/goofyIcon.png"
    });

    
    hostingWindow.loadFile('index.html');

}

app.whenReady().then(() => {
  createWindow()
})