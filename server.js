require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google Generative AI with the API key from environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_API_KEY);

// CORS configuration
const corsOptions = {
  origin: "*", // Allow all origins
  credentials: true // Enable credentials
};
app.use(cors(corsOptions));

// Middleware for JSON and URL-encoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

// Create an HTTP server and a Socket.IO instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: corsOptions // Apply the same CORS options to Socket.IO
});

// Handle socket connections
let socket;
io.on('connection', (socketConnection) => {
  console.log('Client connected');
  socket = socketConnection;
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// POST route for content generation
app.post('/generate', async (req, res) => {
  const { base64Image, prompt } = req.body;
  const imagePart = base64Image ? {
    inlineData: {
      data: base64Image,
      mimeType: 'image/png'
    },
  } : null;

  try {
    let result;
    const modelType = base64Image ? "gemini-1.5-flash" : "gemini-pro";
    const model = genAI.getGenerativeModel({ model: modelType });

    // Generate content stream based on input
    result = await model.generateContentStream(base64Image ? [prompt, imagePart] : prompt);

    let text = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      console.log(chunkText);
      text += chunkText;

      // Emit the content via socket
      if (socket) {
        try {
          socket.emit('content', chunkText);
        } catch (error) {
          console.error('Error emitting content:', error.message);
        }
      }
    }

    // Final message
    if (socket) {
      socket.emit('content', "Hope this is useful :)");
      socket.disconnect(); // Disconnect socket after sending final message
    }
    
    res.status(200).json({ message: "Success", content: text });
  } catch (err) {
    console.error('Error generating content:', err.message);
    res.status(500).json({ error: 'Error generating content' });
  }
});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port} 🚀⚡`);
});
