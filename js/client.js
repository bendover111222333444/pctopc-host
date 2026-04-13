const { ipcRenderer } = require("electron")

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const roomIdLabel = document.getElementById("roomIdLabel");
const videoEle = document.getElementById("videoPlayer");

let started = false;
let currentCapture;
let serverSocket;
let inputChannel;
let pConn;
let fps = 60;

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

})();

async function startCapture() {

    try {

        pConn = new RTCPeerConnection(config)

        const roomId = crypto.randomUUID();
        
        serverSocket = new WebSocket(`wss://pctopc.sigmasigmaonthewallwhoisthe2.workers.dev?room=${roomId}`); // change this to your own if you are forking or it wont work

        await new Promise(resolve => serverSocket.onopen = resolve);

        roomIdLabel.textContent = "Room Id: " + roomId;

        const sources = await ipcRenderer.invoke("source");
        const source = sources[0];

        const capture = await navigator.mediaDevices.getUserMedia({ 
        video: {
            mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: source.id,
                minFrameRate: 60,
                maxFrameRate: 60
            }
        }})

        currentCapture = capture;

        videoEle.srcObject = capture;

        //toggleCapture(capture, false);

        capture.getVideoTracks()[0].onended = () => {
           
            stopCapture();
            
        };

        capture.getTracks().forEach(track => pConn.addTrack(track, capture))
        
        inputChannel = pConn.createDataChannel("input")

        inputChannel.onmessage = msg => {
            
            const data = JSON.parse(msg.data);

            if (data) {

                ipcRenderer.send("input", data)

            }

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
                    
                    }

                    inputChannel = pConn.createDataChannel("input");

                    inputChannel.onmessage = msg => {
                        
                        const data = JSON.parse(msg.data);
                        
                        if (data) {
                            
                            ipcRenderer.send("input", data);
                        
                        }
                    
                    };

                    offer = await pConn.createOffer();
                    await pConn.setLocalDescription(offer);
                
                    serverSocket.send(JSON.stringify({type: "offer", actualData: offer}));

                }

            }

        };

        pConn.onicecandidate = iceCandidate => {

            if (iceCandidate.candidate) {
            
                serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}));

            }

        };


    } catch (err) {

        console.log(err);
    
    }

}

function toggleCapture(capture, toggle) {

    if (toggle == false) {

        capture.getTracks().forEach(function(track){

            track.enabled = false;
                    
        });

    } else {

        capture.getTracks().forEach(function(track){

            track.enabled = true;
                    
        });

    }

}

async function stopCapture() {
    
    started = false;

    roomIdLabel.textContent = "Room Id: Start a session"
    
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

document.addEventListener("keydown", (event) => {
    
    if (event.ctrlKey && event.key === "m") {

        ipcRenderer.send("shutdown");

    }

});