# Use the official Python 3.10 image
FROM python:3.10

# Set the working directory
WORKDIR /code

# Copy the requirements file and install dependencies
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the project files
COPY ./engine /code/engine
COPY ./static /code/static
COPY ./main.py /code/main.py

# Hugging Face Spaces require Docker apps to expose port 7860
EXPOSE 7860

# Command to run the FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
