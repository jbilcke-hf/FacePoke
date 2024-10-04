FROM nvidia/cuda:12.4.0-devel-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive

ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install --no-install-recommends -y \
  build-essential \
  python3.11 \
  python3-pip \
  python3-dev \
  git \
  curl \
  ffmpeg \
  libglib2.0-0 \
  libsm6 \
  libxrender1 \
  libxext6 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt

# Install pget as root
RUN echo "Installing pget" && \
    curl -o /usr/local/bin/pget -L 'https://github.com/replicate/pget/releases/download/v0.2.1/pget' && \
    chmod +x /usr/local/bin/pget

# Set up a new user named "user" with user ID 1000
RUN useradd -m -u 1000 user
# Switch to the "user" user
USER user
# Set home to the user's home directory
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH


# Set home to the user's home directory
ENV PYTHONPATH=$HOME/app \
  PYTHONUNBUFFERED=1 \
  DATA_ROOT=/tmp/data

RUN echo "Installing requirements.txt"
RUN pip3 install --no-cache-dir --upgrade -r /code/requirements.txt

# yeah.. this is manual for now
#RUN cd client
#RUN bun i
#RUN bun build ./src/index.tsx --outdir ../public/

RUN echo "Installing openmim and mim dependencies"
RUN pip3 install --no-cache-dir -U openmim
RUN mim install mmengine
RUN mim install "mmcv>=2.0.1"
RUN mim install "mmdet>=3.3.0"
RUN mim install "mmpose>=1.3.2"

WORKDIR $HOME/app

COPY --chown=user . $HOME/app

EXPOSE 8080

ENV PORT 8080

CMD python3 app.py
