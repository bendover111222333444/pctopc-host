const { ipcRenderer } = require("electron");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const roomIdLabel = document.getElementById("roomIdLabel");
const videoEle = document.getElementById("videoPlayer");
const scaleEle = document.getElementById("scale");
const setScaleEle = document.getElementById("setScaleBtn");
const setScaleLabel = document.getElementById("setScaleLabel");
const errorEle = document.getElementById("errorBox");
const activeLabel = document.getElementById("activeLabel");

const errorClearTime = 60000; // ms
const websocketPing = 20000; // also ms
const maxBRate = 5000000; // in bytes
const minBRate = 2000000; // in bytes

let started = false;
let currentCapture;
let serverSocket;
let inputChannel;
let screenData;
let pConn;
let fps = 120;
let screenScale = 1;

let config = {
    iceServers: [
         { urls: "stun:stun.l.google.com:19302" },
    ]
}

async function generateCreds() {

    const response = await fetch("https://pctopc.sigmasigmaonthewallwhoisthe2.workers.dev/turn-creds") // this could break in the future if it becomes deprecated and also dont use it just use there offical service its just because im poor and i dont have access to a offical credit card
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

async function startCapture() {

    try {

        pConn = new RTCPeerConnection(config)

        const roomId = crypto.randomUUID();
        
        serverSocket = new WebSocket(`wss://pctopc.sigmasigmaonthewallwhoisthe2.workers.dev?room=${roomId}`); // change this to your own if you are forking or it wont work

        await new Promise(resolve => serverSocket.onopen = resolve);

        roomIdLabel.textContent = "Room Id: " + roomId;
        activeLabel.textContent = "Active: 🟢"

        const sources = await ipcRenderer.invoke("source");
        const source = sources[0];

        if (sources.length === 0) {

            errorEle.value += "No capture sources found - check screen recording permissions (specifically on mac)\n";
        
        }

        if (screenData) {

            videoEle.style.width = screenData.width + "px";
            videoEle.style.height = screenData.height + "px";

        } else {

            errorEle.value += "Screen data not found\n";

        }

        const capture = await navigator.mediaDevices.getUserMedia({ 
            video: {
                mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: source.id,
                    minFrameRate: fps,
                    maxFrameRate: fps,
                }
            },
            audio: {
                mandatory: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: source.id,
                }
            }
        })

        currentCapture = capture;

        videoEle.srcObject = capture;
     
        capture.getAudioTracks().forEach(track => {
            
            track.enabled = false
        
        })

        capture.getVideoTracks()[0].onended = () => {
           
            stopCapture();
            
        };

        capture.getTracks().forEach(track => pConn.addTrack(track, capture))

        const transceivers = pConn.getTransceivers();
        transceivers.forEach(transceiver => {

            if (transceiver.sender.track?.kind === "video") {
                
                const codecs = RTCRtpSender.getCapabilities("video").codecs;
                const preferred = codecs.filter(c => c.mimeType === "video/H264");
                const rest = codecs.filter(c => c.mimeType !== "video/H264");
                
                transceiver.setCodecPreferences([...preferred, ...rest]);

            }

        });

        inputChannel = pConn.createDataChannel("input")

        inputChannel.onopen = async () => {

            inputChannel.send(JSON.stringify(screenData));
            
        }

        ipcRenderer.on("display-changed", async () => {

            screenData = await ipcRenderer.invoke("screen-size");

            if (inputChannel) {

                inputChannel.send(JSON.stringify(screenData));

            } else {

                errorEle.value += "Input channel doesnt exist\n";

            }

        });

        inputChannel.onmessage = msg => {
            
            const data = JSON.parse(msg.data);

            if (data) {

                ipcRenderer.send("input", data)

            } else {

                errorEle.value += "Input packet wrongly sent\n";

            }

        }

        let offer = await pConn.createOffer({offerToReceiveAudio: false, offerToReceiveVideo: false});
        await pConn.setLocalDescription(offer);
    
        serverSocket.send(JSON.stringify({type: "offer", actualData: offer}));

        serverSocket.onmessage = async msg => {

            const data = JSON.parse(msg.data);
            if (data.type) {

                if (data.type == "answer" && data.actualData) {

                    pConn.setRemoteDescription(data.actualData);

                    const sender = pConn.getSenders().find(s => s.track && s.track.kind === "video")
                    
                    if (sender) {
                        
                        const params = sender.getParameters()
                        params.encodings[0].minBitrate = minBRate
                        params.encodings[0].maxBitrate = maxBRate
                        params.encodings[0].networkPriority = "high"
                        params.encodings[0].priority = "high"
                        params.encodings[0].minFramerate = fps
                        params.encodings[0].maxFramerate = fps * 2
                        params.encodings[0].scaleResolutionDownBy = screenScale
                        params.encodings[0].degradationPreference = "maintain-framerate"

                        await sender.setParameters(params)
                    
                    } else {

                        errorEle.value += "Input packet wrongly sent\n";

                    }

                } else if (data.type == "ICE" && data.actualData) {
                    
                    pConn.addIceCandidate(data.actualData)

                } else if (data.type == "clientConnected") {

                    if (inputChannel) {

                        inputChannel.close();
                        inputChannel = null;
                    
                    } else {

                        errorEle.value += "Input channel doesnt exist\n";

                    }

                    if (pConn) {
                        
                        pConn.close()
                    
                    }

                    pConn = new RTCPeerConnection(config)

                    currentCapture.getTracks().forEach(track => pConn.addTrack(track, currentCapture))

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

                    inputChannel = pConn.createDataChannel("input");

                    inputChannel.onopen = async () => {

                        console.log("new input channel")
                        screenData = await ipcRenderer.invoke("screen-size");
                        inputChannel.send(JSON.stringify(screenData));
                    
                    };

                    inputChannel.onmessage = msg => {
                        
                        const data = JSON.parse(msg.data);
                        
                        if (data) {
                            
                            ipcRenderer.send("input", data);
                        
                        } else {

                            errorEle.value += "Input packet wrongly sent\n";

                        }
                    
                    };

                    offer = await pConn.createOffer();
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

async function changeScale() {
        
    const sender = pConn.getSenders().find(s => s.track && s.track.kind === "video")
    
    if (sender) {
        
        const params = sender.getParameters()
        params.encodings[0].scaleResolutionDownBy = screenScale
        params.degradationPreference = "maintain-framerate"
        
        await sender.setParameters(params)
    
    } else {

        errorEle.value += "Connection has not established yet cannot change scale\n";
    
    }

    if (screenData) {

        videoEle.style.width = Math.floor(screenData.width / screenScale) + "px";
        videoEle.style.height = Math.floor(screenData.height / screenScale) + "px";

    }

}

async function stopCapture() {
    
    started = false;

    roomIdLabel.textContent = "Room Id: Start a session"
    activeLabel.textContent = "Active: 🔴"

    videoEle.style.width = "0px";
    videoEle.style.height = "0px";

    if (pConn) {

        pConn.close();
        pConn = null;

    }

    if (serverSocket) {

        serverSocket.close();
        serverSocket = null;

    }

    if (currentCapture) {

        currentCapture.getTracks().forEach(function(track){
            
            track.stop();
                    
        });

        videoEle.srcObject = null;

        currentCapture = null;

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

scaleEle.addEventListener("input", function (event) {

    if (screenData) {

        let scale = Math.floor(1 / scaleEle.value)

        if (scale == Infinity || scale < 1) {

            scale = 1;

        }

        setScaleLabel.textContent = `New XY Size: X: ${screenData.width / scale} Y: ${screenData.height / scale}`
        
    }

});

setScaleEle.addEventListener("click", function () {

    screenScale = Math.floor(1 / scaleEle.value)

    if (screenScale == Infinity || screenScale < 1) {

        screenScale = 1;

        errorEle.value += "Cannot set scale bigger than one\n";

    }

    changeScale();

    scaleEle.value = "";

})

setInterval(() => {
    
    errorEle.value = "";

}, errorClearTime)