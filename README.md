---
title: FacePoke
emoji: 💬
colorFrom: yellow
colorTo: red
sdk: docker
pinned: true
license: mit
header: mini
app_file: app.py
app_port: 8080
---

# FacePoke

## Table of Contents

- [Introduction](#introduction)
- [Acknowledgements](#acknowledgements)
- [Installation](#installation)
  - [Local Setup](#local-setup)
  - [Docker Deployment](#docker-deployment)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Introduction

A real-time head transformation app.

For best performance please run the app from your own machine (local or in the cloud).

**Repository**: [GitHub - jbilcke-hf/FacePoke](https://github.com/jbilcke-hf/FacePoke)

You can try the demo but it is a shared space, latency may be high if there are multiple users or if you live far from the datacenter hosting the Hugging Face Space.

**Live Demo**: [FacePoke on Hugging Face Spaces](https://huggingface.co/spaces/jbilcke-hf/FacePoke)

## Acknowledgements

This project is based on LivePortrait: https://arxiv.org/abs/2407.03168

It uses the face transformation routines from https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait

## Installation

### Local Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jbilcke-hf/FacePoke.git
   cd FacePoke
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Install frontend dependencies:
   ```bash
   cd client
   bun install
   ```

4. Build the frontend:
   ```bash
   bun build ./src/index.tsx --outdir ../public/
   ```

5. Start the backend server:
   ```bash
   python app.py
   ```

6. Open `http://localhost:8080` in your web browser.

### Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t facepoke .
   ```

2. Run the container:
   ```bash
   docker run -p 8080:8080 facepoke
   ```

3. To deploy to Hugging Face Spaces:
   - Fork the repository on GitHub.
   - Create a new Space on Hugging Face.
   - Connect your GitHub repository to the Space.
   - Configure the Space to use the Docker runtime.

## Development

The project structure is organized as follows:

- `app.py`: Main backend server handling WebSocket connections.
- `engine.py`: Core logic.
- `loader.py`: Initializes and loads AI models.
- `client/`: Frontend React application.
  - `src/`: TypeScript source files.
  - `public/`: Static assets and built files.

## Contributing

Contributions to FacePoke are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on how to submit pull requests, report issues, or request features.

## License

FacePoke is released under the MIT License. See the [LICENSE](LICENSE) file for details.

Please note that while the code of LivePortrait and Insightface are open-source with "no limitation for both academic and commercial usage", the model weights trained from Insightface data are available for [https://github.com/deepinsight/insightface?tab=readme-ov-file#license](non-commercial research purposes only).

---

Developed with ❤️ by Julian Bilcke at Hugging Face
