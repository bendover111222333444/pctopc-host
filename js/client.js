const { ipcRenderer } = require("electron");
const net = require('net')

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const roomIdLabel = document.getElementById("roomIdLabel");
const errorEle = document.getElementById("errorBox");
const activeLabel = document.getElementById("activeLabel");

const errorClearTime = 60_000; // ms
const websocketPing = 20_000; // also ms
const sendChunkSize = 16_384 // 16KB

const signalingWorker = "pctopc.sigmasigmaonthewallwhoisthe2.workers.dev"

let started = false;

let serverSocket;
let inputChannel;
let videoChannel;
let screenData;
let tcpSocket;
let pConn;
let fps = 60;

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

})();

ipcRenderer.on('tcp-port', (event, port) => {

    tcpSocket = net.createConnection(port, '127.0.0.1')

    let buffer = Buffer.alloc(0)
    
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

        const roomId = crypto.randomUUID();
        
        serverSocket = new WebSocket(`wss://${signalingWorker}?room=${roomId}`); // change this to your own if you are forking or it wont work

        await new Promise(resolve => serverSocket.onopen = resolve);

        roomIdLabel.textContent = "Room Id: " + roomId;

        const sources = await ipcRenderer.invoke("source")
        const source = sources[0]

        const capture = await navigator.mediaDevices.getUserMedia({ 
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
            activeLabel.textContent = "Connected: 🟢"

        }

        videoChannel.onclose = async () => {

            capture.getTracks().forEach(track => track.enabled = false);
            await ipcRenderer.invoke('stop-capture');
            activeLabel.textContent = "Connected: 🔴"

        }

        let offer = await pConn.createOffer();
        await pConn.setLocalDescription(offer);
    
        serverSocket.send(JSON.stringify({type: "offer", actualData: offer}));

        serverSocket.onmessage = async msg => {

            const data = JSON.parse(msg.data);
            if (data.type) {

                if (data.type == "answer" && data.actualData) {

                    pConn.setRemoteDescription(data.actualData);

                } else if (data.type == "ICE" && data.actualData) {
                    
                    pConn.addIceCandidate(data.actualData)

                } else if (data.type == "clientConnected") {

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
                        
                        pConn.close()
                    
                    }

                    pConn = new RTCPeerConnection(config)

                    pConn.onicecandidate = iceCandidate => {
                        
                        if (iceCandidate.candidate) {
                            
                            serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}))
                        
                        }
                    
                    }

                    pConn.onconnectionstatechange = () => {
            
                        if (pConn.connectionState === 'failed') {

                            pConn.restartIce()

                        }

                    }

                    inputChannel = pConn.createDataChannel("input", {maxRetransmits: 0});

                    videoChannel = pConn.createDataChannel("video", {ordered: false, maxRetransmits: 0})
                    
                    inputChannel.onopen = async () => {
                        
                        screenData = await ipcRenderer.invoke("screen-size");
                        inputChannel.send(JSON.stringify(screenData));
                    
                    };

                    videoChannel.onopen = async () => {

                        capture.getTracks().forEach(track => track.enabled = true);
                        await ipcRenderer.invoke('start-capture')
                        activeLabel.textContent = "Connected: 🟢"

                    }

                    videoChannel.onclose = async () => {

                        capture.getTracks().forEach(track => track.enabled = false);
                        await ipcRenderer.invoke('stop-capture');
                        activeLabel.textContent = "Connected: 🔴"

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
                
                    serverSocket.send(JSON.stringify({type: "offer", actualData: offer}));

                }

            } else {

                errorEle.value += "Wrong data types\n";

            }

        };

        pConn.onicecandidate = iceCandidate => {

            if (iceCandidate.candidate) {
            
                serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}));

            }

        };

        pConn.onconnectionstatechange = () => {

            if (pConn.connectionState === 'failed') {

                pConn.restartIce()

            }

        }

        setInterval(() => {
            
            if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
                
                serverSocket.send(JSON.stringify({ type: "ping" }))
            
            } else {

                errorEle.value += "Server socket is not open or doesnt exist \n";

            }


        }, websocketPing)

    } catch (err) {

        errorEle.value += err + "\n";
    
    }

}

async function stopCapture() {
    
    started = false;

    roomIdLabel.textContent = "Room Id: Start a session"
    activeLabel.textContent = "Connected: 🔴"

    if (inputChannel) { inputChannel.close(); inputChannel = null }
    if (videoChannel) { videoChannel.close(); videoChannel = null }

    if (tcpSocket) { tcpSocket.destroy(); tcpSocket = null }

    await ipcRenderer.invoke('stop-capture')

    if (serverSocket) {

        serverSocket.close();
        serverSocket = null;

    }

}

startBtn.addEventListener("click", function(){
    
    if (started == false) {

        startCapture();
        started = true;
    
    }

});

stopBtn.addEventListener("click", function(){
    
    if (started == true) {

        stopCapture();
        started = false;
    
    }

});

setInterval(() => {
    
    errorEle.value = "";

}, errorClearTime)