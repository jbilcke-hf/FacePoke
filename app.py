"""
FacePoke API

Author: Julian Bilcke
Date: September 30, 2024
"""

import sys
import asyncio
from aiohttp import web, WSMsgType
import json
import uuid
import logging
import os
import signal
from typing import Dict, Any, List, Optional
import base64
import io
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Set asyncio logger to DEBUG level
logging.getLogger("asyncio").setLevel(logging.DEBUG)

logger.debug(f"Python version: {sys.version}")

# SIGSEGV handler
def SIGSEGV_signal_arises(signalNum, stack):
    logger.critical(f"{signalNum} : SIGSEGV arises")
    logger.critical(f"Stack trace: {stack}")

signal.signal(signal.SIGSEGV, SIGSEGV_signal_arises)

from loader import initialize_models
from engine import Engine, base64_data_uri_to_PIL_Image

# Global constants
DATA_ROOT = os.environ.get('DATA_ROOT', '/tmp/data')
MODELS_DIR = os.path.join(DATA_ROOT, "models")

image_cache: Dict[str, Image.Image] = {}

async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """
    Handle WebSocket connections for the FacePoke application.

    Args:
        request (web.Request): The incoming request object.

    Returns:
        web.WebSocketResponse: The WebSocket response object.
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    try:
        #logger.info("New WebSocket connection established")

        while True:
            msg = await ws.receive()

            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)

                # let's not log user requests, they are heavy
                #logger.debug(f"Received message: {data}")

                if data['type'] == 'modify_image':
                    uuid = data.get('uuid')
                    if not uuid:
                        logger.warning("Received message without UUID")

                    await handle_modify_image(request, ws, data, uuid)


            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                #logger.warning(f"WebSocket connection closed: {msg.type}")
                break

    except Exception as e:
        logger.error(f"Error in websocket_handler: {str(e)}")
        logger.exception("Full traceback:")
    return ws

async def handle_modify_image(request: web.Request, ws: web.WebSocketResponse, msg: Dict[str, Any], uuid: str):
    """
    Handle the 'modify_image' request.

    Args:
        request (web.Request): The incoming request object.
        ws (web.WebSocketResponse): The WebSocket response object.
        msg (Dict[str, Any]): The message containing the image or image_hash and modification parameters.
        uuid: A unique identifier for the request.
    """
    #logger.info("Received modify_image request")
    try:
        engine = request.app['engine']
        image_hash = msg.get('image_hash')

        if image_hash:
            image_or_hash = image_hash
        else:
            image_data = msg['image']
            image_or_hash = image_data

        modified_image_base64 = await engine.modify_image(image_or_hash, msg['params'])

        await ws.send_json({
            "type": "modified_image",
            "image": modified_image_base64,
            "image_hash": engine.get_image_hash(image_or_hash),
            "success": True,
            "uuid": uuid  # Include the UUID in the response
        })
        #logger.info("Successfully sent modified image")
    except Exception as e:
        #logger.error(f"Error in modify_image: {str(e)}")
        await ws.send_json({
            "type": "modified_image",
            "success": False,
            "error": str(e),
            "uuid": uuid  # Include the UUID even in error responses
        })

async def index(request: web.Request) -> web.Response:
    """Serve the index.html file"""
    content = open(os.path.join(os.path.dirname(__file__), "public", "index.html"), "r").read()
    return web.Response(content_type="text/html", text=content)

async def js_index(request: web.Request) -> web.Response:
    """Serve the index.js file"""
    content = open(os.path.join(os.path.dirname(__file__), "public", "index.js"), "r").read()
    return web.Response(content_type="application/javascript", text=content)

async def hf_logo(request: web.Request) -> web.Response:
    """Serve the hf-logo.svg file"""
    content = open(os.path.join(os.path.dirname(__file__), "public", "hf-logo.svg"), "r").read()
    return web.Response(content_type="image/svg+xml", text=content)

async def initialize_app() -> web.Application:
    """Initialize and configure the web application."""
    try:
        logger.info("Initializing application...")
        live_portrait = await initialize_models()

        logger.info("🚀 Creating Engine instance...")
        engine = Engine(live_portrait=live_portrait)
        logger.info("✅ Engine instance created.")

        app = web.Application()
        app['engine'] = engine

        # Configure routes
        app.router.add_get("/", index)
        app.router.add_get("/index.js", js_index)
        app.router.add_get("/hf-logo.svg", hf_logo)
        app.router.add_get("/ws", websocket_handler)

        logger.info("Application routes configured")

        return app
    except Exception as e:
        logger.error(f"🚨 Error during application initialization: {str(e)}")
        logger.exception("Full traceback:")
        raise

if __name__ == "__main__":
    try:
        logger.info("Starting FacePoke application")
        app = asyncio.run(initialize_app())
        logger.info("Application initialized, starting web server")
        web.run_app(app, host="0.0.0.0", port=8080)
    except Exception as e:
        logger.critical(f"🚨 FATAL: Failed to start the app: {str(e)}")
        logger.exception("Full traceback:")
