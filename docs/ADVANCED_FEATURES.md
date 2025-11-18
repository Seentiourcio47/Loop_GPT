# Advanced Features Guide

## Overview

Loop GPT now supports advanced features including image generation, vision analysis, and more.

## 🎨 Image Generation

### Text-to-Image

Generate images from text prompts using AI models:

**Available Models:**
- `flux-schnell` - Fast generation (10-30 seconds) ⚡⚡⚡
- `flux-dev` - High quality (30-90 seconds) ⚡
- `sd35` - Stable Diffusion 3.5 (20-60 seconds) ⚡⚡

**Usage:**

1. **Auto-detection** - Type commands like:
   - "generate image of a sunset"
   - "draw a cat"
   - "create image: a futuristic city"
   - "/image a beautiful landscape"

2. **Manual selection** - Select "🎨 Generate Image" from the tool dropdown

3. **Model selection** - Specify in your prompt:
   - "generate image using flux-dev"
   - "draw with sd35"
   - "quick image of..." (uses flux-schnell)

**Example Prompts:**
- "Generate an image of a cyberpunk cityscape"
- "Draw a cute robot"  
- "Create a beautiful sunset over mountains"
- "/image a futuristic spaceship"

## 👁️ Vision Analysis

### Image Analysis

Automatically describe and analyze uploaded images.

**Usage:**

1. Upload an image using the 📷 button
2. The AI will automatically analyze the image
3. Or type a question to get specific information

**Example:**
- Upload image → Auto-analysis describes the image
- Upload image + "What objects are in this image?"

## 🔍 Vision Q&A

Ask questions about uploaded images using vision models.

**Usage:**

1. Upload an image
2. Ask questions about it:
   - "What is in this image?"
   - "Describe this image in detail"
   - "What colors are prominent?"
   - "What is the style of this artwork?"

**Models:**
- `llava` - Large Language and Vision Assistant (default)

## 🛠️ Tool Detection

The system automatically detects which tool to use based on your input:

- **Image generation keywords**: generate, create, draw, paint, /image
- **Vision analysis**: Upload image without questions → auto-analysis
- **Vision Q&A**: Upload image + questions → vision chat
- **Regular chat**: Everything else → GPT chat

### Manual Tool Selection

Use the tool dropdown to manually select:
- **Auto** - Let the AI decide
- **💬 Chat** - Regular GPT conversation
- **🎨 Generate Image** - Text-to-image generation
- **👁️ Analyze Image** - Image analysis
- **🔍 Vision Q&A** - Question answering about images

## 📊 Supported File Formats

- JPEG/JPG
- PNG
- GIF
- WebP

Maximum file size: 10MB

## 🚀 Advanced Features

### Model Context Protocol (MCP) Support

MCP integration is ready for future expansion. The system can be extended to support:
- Custom tools and functions
- External API integrations
- Plugin system
- Workflow automation

### GPT Creations

Extended GPT capabilities including:
- Multi-modal interactions
- Advanced context understanding
- Tool chaining (combine multiple tools)
- Custom instructions

## 🔌 API Integration

### Image Generation API

The backend integrates with your image generation API at `http://localhost:8081`:

**Endpoints:**
- `POST /api/generate` - Generate images
- `POST /api/analyze` - Analyze images  
- `POST /api/vision-chat` - Vision Q&A

**Configuration:**

Set `IMAGE_API_URL` in your backend `.env`:
```env
IMAGE_API_URL=http://localhost:8081
```

### Backend Routes

- `POST /api/conversations/:id/messages` - Send message with tool detection
- `POST /api/conversations/:id/upload-image` - Upload image file
- `GET /api/conversations/:id/messages` - Get messages (includes images)

## 💡 Usage Examples

### Example 1: Generate an Image

1. Type: "generate image of a sunset over the ocean"
2. System detects image generation intent
3. Generates image using flux-schnell (fast)
4. Displays image in chat

### Example 2: Analyze Uploaded Image

1. Click 📷 button
2. Select image file
3. Upload automatically triggers analysis
4. Receive detailed description

### Example 3: Ask About Image

1. Upload image
2. Type: "What is the main subject of this image?"
3. System uses vision-chat tool
4. Receive specific answer

### Example 4: Custom Model Selection

1. Type: "generate image using flux-dev: a detailed portrait"
2. System uses flux-dev for higher quality
3. Takes longer but produces better results

## 🎯 Best Practices

1. **Image Generation**:
   - Be specific in your prompts
   - Use flux-schnell for quick tests
   - Use flux-dev for final artwork

2. **Vision Analysis**:
   - Upload clear, high-quality images
   - Ask specific questions for better results

3. **Tool Selection**:
   - Use "Auto" for most cases
   - Manual selection gives more control

## 🔐 Security

- Image uploads are validated
- File size limits enforced
- File type restrictions
- Uploaded files are stored securely

## 🐛 Troubleshooting

**Image generation fails:**
- Check IMAGE_API_URL is correct
- Verify image API is running on port 8081
- Check API logs for errors

**Image upload fails:**
- Verify file is under 10MB
- Check file format is supported
- Ensure backend uploads directory exists

**Tool not detected correctly:**
- Use manual tool selection
- Be more specific in your prompt
- Check tool detection logic in backend

## 📚 Related Documentation

- [Backend & Database Summary](./BACKEND_DATABASE_SUMMARY.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [API Integration Guide](../README.md)

