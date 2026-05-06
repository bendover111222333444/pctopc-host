const { ipcRenderer, ipcMain } = require("electron");
const net = require('net')

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const copyBtn = document.getElementById("copyBtn");
const scaleBtn = document.getElementById("scaleBtn");
const bitrateBtn = document.getElementById("bitrateBtn");
const fpsBtn = document.getElementById("fpsBtn");
const roomIdLabel = document.getElementById("roomIdLabel");
const activeLabel = document.getElementById("activeLabel");
const errorEle = document.getElementById("errorBox");
const xScaleInput = document.getElementById("xScaleInput");
const yScaleInput = document.getElementById("yScaleInput");
const fpsInput = document.getElementById("fpsInput");
const bitrateInput = document.getElementById("bitrateInput")

const errorClearTime = 300_000_000; // ms
const sendChunkSize = 16_384 // 16KB
const maxBufferSize = 5_000_000 // number?
const iceTimeOut = 5_000; // ms
const selfPingTime = 600_000; // ms

const originalRoomIdText = "Room Id: Start a session"

const signalingWorker = "signaling.bendover111222333444.great-site.net" // change this to your own if you are forking or it wont work

let started = false;
let remoteDescSet = false;

let iceCandidateQueue = []

let buffer = Buffer.alloc(0)
let serverSocket;
let inputChannel;
let videoChannel;
let previewDecoder;
let screenData;
let tcpSocket;
let pConn;
let roomId;
let pingInterval;

let config = {

    iceServers: [
         
        { urls: "stun:stun.l.google.com:19302" },
    
    ]

}

async function generateCreds() {

    const response = await fetch(`https://${signalingWorker}/turn-creds`) // this could break in the future if it becomes deprecated and also dont use it just use there offical service its just because im poor and i dont have access to a offical credit card
    const creds = await response.json()

    config = {

        iceServers: [
            
            { urls: "stun:stun.l.google.com:19302" },
            
            {
                urls: creds.urls,
                username: creds.username,
                credential: creds.credential
            }

        ]

    }

}

(async () => {

    await generateCreds();
    screenData = await ipcRenderer.invoke("screen-size");
    useGpu = await ipcRenderer.invoke("getIsNvidia")
    gpuBtn.textContent = `Using: ${useGpu ? 'GPU' : 'CPU'}`

})();

ipcRenderer.on('tcp-port', (event, port) => {

    tcpSocket = net.createConnection(port, '127.0.0.1')
    tcpSocket.setNoDelay(true)

    buffer = Buffer.alloc(0)

    tcpSocket.on('data', (chunk) => {

        buffer = Buffer.concat([buffer, chunk])

        while (true) {

            let nextStart = -1

            for (let i = 4; i < buffer.length - 3; i++) {

                if (buffer[i] === 0 && buffer[i+1] === 0 && buffer[i+2] === 0 && buffer[i+3] === 1) {

                    nextStart = i
                    break

                }

            }

            if (nextStart === -1) break

            const nal = buffer.slice(0, nextStart)
            buffer = buffer.slice(nextStart)

            if (nal.length < 5 || !videoChannel || videoChannel.readyState !== 'open') continue

            if (videoChannel.bufferedAmount > maxBufferSize) {

                buffer = Buffer.alloc(0)
                break

            }

            const nalType = nal[4] & 0x1f
            const isKey = nalType === 5 || nalType === 7 || nalType === 8

            const header = new ArrayBuffer(13)
            const headerView = new DataView(header)

            headerView.setUint8(0, isKey ? 1 : 0)
            headerView.setFloat64(1, performance.now() * 1000)
            headerView.setUint32(9, nal.length)

            videoChannel.send(header)

            for (let i = 0; i < nal.length; i += sendChunkSize) {

                videoChannel.send(Buffer.from(nal.slice(i, i + sendChunkSize)))

            }

        }

    })

    tcpSocket.on('error', () => {})

})

async function startCapture() {

    try {

        pConn = new RTCPeerConnection(config)

        roomId = crypto.randomUUID();
        
        serverSocket = new WebSocket(`wss://${signalingWorker}?room=${roomId}`);
        
        activeLabel.textContent = "Connected: 🟠 Opening Server max 30 sec"

        await new Promise(resolve => serverSocket.onopen = resolve);

        pConn.onicecandidate = iceCandidate => {

            if (iceCandidate.candidate) {
            
                serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}));

            }

        };

        serverSocket.onerror = (err) => errorEle.value += `WS Error: ${JSON.stringify(err)}\n`
        serverSocket.onclose = async (err) => {
            
            errorEle.value += `WS Closed: ${err.code} ${err.reason}\n`
            await stopCapture()
        
        }

        activeLabel.textContent = "Connected: 🟠 Opened Server Awaiting Connection"

        roomIdLabel.textContent = `Room Id: ${roomId}`;

        const sources = await ipcRenderer.invoke("source")
        const source = sources[0]

        let capture;

        try {
            
            capture = await navigator.mediaDevices.getUserMedia({ 
                
                video: {
                    
                    mandatory: {
                        
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: source.id,
                        minWidth: 320,
                        maxWidth: 320,
                        minHeight: 240,
                        maxHeight: 240,
                        minFrameRate: 1,
                        maxFrameRate: 1,
                    
                    }
                
                },
                
                audio: {
                    
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: source.id,

                    }

                }
                
            })

        } catch(err) {

            errorEle.value += `${err}\n`;

            capture = await navigator.mediaDevices.getUserMedia({ 
                
                video: {
                    
                    mandatory: {

                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: source.id,
                        minWidth: 320,
                        maxWidth: 320,
                        minHeight: 240,
                        maxHeight: 240,
                        minFrameRate: 1,
                        maxFrameRate: 1,
                    
                    }
                
                }
            
            })
        
        }

        capture.getAudioTracks().forEach(track => {

            pConn.addTrack(track, capture)
            
        })

        capture.getTracks().forEach(track => track.enabled = false);

        inputChannel = pConn.createDataChannel("input", {maxRetransmits: 0})

        videoChannel = pConn.createDataChannel("video", {ordered: false, maxRetransmits: 0})

        ipcRenderer.on("display-changed", async () => {

            screenData = await ipcRenderer.invoke("screen-size");

            if (inputChannel) {

                inputChannel.send(JSON.stringify(screenData));

            } else {

                errorEle.value += "Input channel doesnt exist\n";

            }

        });

        inputChannel.onopen = async () => {

            inputChannel.send(JSON.stringify(screenData));
            
        }

        inputChannel.onmessage = msg => {
            
            const data = JSON.parse(msg.data);

            if (data) {

                ipcRenderer.send("input", data)

            } else {

                errorEle.value += "Input packet wrongly sent\n";

            }

        }

        videoChannel.onopen = async () => {

            capture.getTracks().forEach(track => track.enabled = true);
            await ipcRenderer.invoke('start-capture')
            buffer = Buffer.alloc(0)
            activeLabel.textContent = "Connected: 🟢 Client Connected"

        }

        let offer = await pConn.createOffer();
        await pConn.setLocalDescription(offer);
        
        await new Promise(resolve => {

            if (pConn.iceGatheringState === 'complete') return resolve()

            pConn.onicegatheringstatechange = () => {

                if (pConn.iceGatheringState === 'complete') resolve()

            }

            setTimeout(resolve, iceTimeOut)

        })

        serverSocket.send(JSON.stringify({type: "offer", actualData: pConn.localDescription}));

        serverSocket.onmessage = async msg => {

            const data = JSON.parse(msg.data);
            if (data.type) {

                if (data.type == "answer" && data.actualData) {

                    await pConn.setRemoteDescription(data.actualData);
                    remoteDescSet = true

                    for (const cand of iceCandidateQueue) {

                        try {
                            
                            await pConn.addIceCandidate(cand) 
                        
                        } catch(err) {}

                    }
                    
                    iceCandidateQueue = []

                } else if (data.type == "ICE" && data.actualData) {

                    if (remoteDescSet) {

                        try {

                            await pConn.addIceCandidate(data.actualData)
                        
                        } catch(err) {}

                    } else {

                        iceCandidateQueue.push(data.actualData)

                    }
                } else if (data.type == "clientConnected") {
                    
                    remoteDescSet = false
                    iceCandidateQueue = []

                    capture.getTracks().forEach(track => track.enabled = false);
                    await ipcRenderer.invoke('stop-capture');
                    buffer = Buffer.alloc(0);

                    if (inputChannel) {

                        inputChannel.close();
                        inputChannel = null;
                    
                    } else {

                        errorEle.value += "Input channel doesnt exist\n";

                    }

                    if (videoChannel) {
                        
                        videoChannel.close()
                        videoChannel = null
                    
                    } else {

                        errorEle.value += "Video channel doesnt exist\n";

                    }

                    if (pConn) {
                        
                        pConn.onicecandidate = null;
                        pConn.onconnectionstatechange = null;
                        pConn.close();
                        pConn = null;
                    
                    }

                    pConn = new RTCPeerConnection(config)

                    pConn.onicecandidate = iceCandidate => {
                        
                        if (iceCandidate.candidate) {
                            
                            serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}))
                        
                        }
                    
                    }

                    pConn.onconnectionstatechange = async () => {

                        if (pConn.connectionState === 'failed') {

                            pConn.restartIce()

                        } else if (pConn.connectionState === 'disconnected' || pConn.connectionState === 'closed') {

                            capture.getTracks().forEach(track => track.enabled = false);
                            await ipcRenderer.invoke('stop-capture');
                            buffer = Buffer.alloc(0)

                            pConn.onicecandidate = null;
                            pConn.onconnectionstatechange = null;
                            pConn.close();
                            pConn = null;

                            activeLabel.textContent = "Connected: 🟠 Awaiting User"

                        }

                    }

                    capture.getAudioTracks().forEach(track => {

                        pConn.addTrack(track, capture)
                        
                    })

                    inputChannel = pConn.createDataChannel("input", {maxRetransmits: 0});

                    videoChannel = pConn.createDataChannel("video", {ordered: false, maxRetransmits: 0})

                    inputChannel.onopen = async () => {
                        
                        screenData = await ipcRenderer.invoke("screen-size");
                        inputChannel.send(JSON.stringify(screenData));
                    
                    };

                    videoChannel.onopen = async () => {

                        capture.getTracks().forEach(track => track.enabled = true);
                        await ipcRenderer.invoke('start-capture')
                        buffer = Buffer.alloc(0)
                        activeLabel.textContent = "Connected: 🟢 Client Connected"

                    }

                    inputChannel.onmessage = msg => {
                        
                        const data = JSON.parse(msg.data);
                        
                        if (data) {
                            
                            ipcRenderer.send("input", data);
                        
                        } else {

                            errorEle.value += "Input packet wrongly sent\n";

                        }
                    
                    };

                    offer = await pConn.createOffer({offerToReceiveAudio: false, offerToReceiveVideo: false});
                    await pConn.setLocalDescription(offer);
                    
                    await new Promise(resolve => {

                        if (pConn.iceGatheringState === 'complete') return resolve()

                        pConn.onicegatheringstatechange = () => {

                            if (pConn.iceGatheringState === 'complete') resolve()

                        }

                        setTimeout(resolve, iceTimeOut)

                    })

                    serverSocket.send(JSON.stringify({type: "offer", actualData: pConn.localDescription}));

                }

            } else {

                errorEle.value += "Wrong data types\n";

            }

        };

        pConn.onconnectionstatechange = async () => {

            if (pConn.connectionState === 'failed') {

                await pConn.restartIce()

            } else if (pConn.connectionState === 'disconnected' || pConn.connectionState === 'closed') {

                capture.getTracks().forEach(track => track.enabled = false);
                await ipcRenderer.invoke('stop-capture');
                buffer = Buffer.alloc(0)

                pConn.onicecandidate = null;
                pConn.onconnectionstatechange = null;
                pConn.close();
                pConn = null;
                
                activeLabel.textContent = "Connected: 🟠 Awaiting User"

            }

        }
        
        pingInterval = setInterval(() => {
            
            fetch(`https://${signalingWorker}`)
        
        }, selfPingTime)

    } catch (err) {

        errorEle.value += err + "\n";
    
    }

}

async function stopCapture() {
    
    started = false;
    roomId = null;

    roomIdLabel.textContent = "Room Id: Start a session"
    activeLabel.textContent = "Connected: 🔴 Stopped"

    if (inputChannel) { inputChannel.close(); inputChannel = null }
    if (videoChannel) { videoChannel.close(); videoChannel = null }

    if (tcpSocket) { tcpSocket.destroy(); tcpSocket = null }

    clearInterval(pingInterval);
    pingInterval = null;

    await ipcRenderer.invoke('stop-capture')
    buffer = Buffer.alloc(0)

    if (serverSocket) {

        serverSocket.close();
        serverSocket = null;

    }

    if (pConn) {

        pConn.onicecandidate = null;
        pConn.onconnectionstatechange = null;
        pConn.close();
        pConn = null;

    }
    
}

startBtn.addEventListener("click", () => {
    
    if (started == false) {

        startCapture();
        started = true;
    
    }

});

stopBtn.addEventListener("click", () => {
    
    if (started == true) {

        stopCapture();
        started = false;
    
    }

});

copyBtn.addEventListener("click", () => {
    
    if (roomId) {

        navigator.clipboard.writeText(roomId);

    } else {

        errorEle.value += "Cannot copy room id doesnt exist yet\n";

    }

})

scaleBtn.addEventListener("click", async () => {

    if (remoteDescSet === true) {

        if (xScaleInput.value !== "" && yScaleInput.value !== "") {

            await ipcRenderer.invoke("changeScale", Number(xScaleInput.value), Number(yScaleInput.value));

        } else {

            errorEle.value += "Cannot accept empty field\n";

        }

        xScaleInput.value = ""
        yScaleInput.value = ""
    
    } else {

        errorEle.value += "Has not connected cannot change scale\n";

    }


})

fpsBtn.addEventListener("click", async () => {

    if (remoteDescSet === true) {

        if (fpsInput.value !== "") {

            await ipcRenderer.invoke("changeFps", Number(fpsInput.value));

        } else {

            errorEle.value += "Cannot accept empty field\n";

        }

        fpsInput.value = ""

    } else {

        errorEle.value += "Has not connected cannot change fps\n";

    }

})

bitrateBtn.addEventListener("click", async () => {

    if (remoteDescSet === true) {

        if (bitrateInput.value !== "") {

            await ipcRenderer.invoke("changeBitrate", Number(bitrateInput.value))

        } else {

            errorEle.value += "Cannot accept empty field\n"

        }

        bitrateInput.value = ""

    } else {

        errorEle.value += "Has not connected cannot change bit rate\n";

    }
})

setInterval(() => {
    
    errorEle.value = "";

}, errorClearTime)
