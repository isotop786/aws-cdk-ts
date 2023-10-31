#!/bin/bash
dnf update -y
dnf install -y mariadb105-server python3 python3-pip
systemctl start mariadb
systemctl enable mariadb
pip3 install flask pymysql

cat << EOF > /home/ec2-user/schema.sql
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('password');
CREATE DATABASE task_logger;

USE task_logger;

CREATE TABLE tasks (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX(created)
);
EOF
mysql </home/ec2-user/schema.sql

cat << EOF > /home/ec2-user/task_logger.py
#!/usr/bin/python3
import json
import os
import pymysql

import flask
app = flask.Flask(__name__)

# Database connection parameters - update as needed 
DB_USER=os.getenv('DB_USER') or 'root'
DB_PSWD=os.getenv('DB_PSWD') or 'password'
DB_NAME=os.getenv('DB_NAME') or 'task_logger'
DB_HOST=os.getenv('DB_HOST') or '127.0.0.1'

db = pymysql.connect(host=DB_HOST, user=DB_USER,password=DB_PSWD,database=DB_NAME,cursorclass=pymysql.cursors.DictCursor)
cursor = db.cursor()

# Create a new task
def create_task(title):
    try:
        sql=""" INSERT INTO tasks (title) VALUES (%s) """
        cursor.execute(sql, title)
        db.commit()
        cursor.execute("SELECT MAX(id) AS id FROM tasks")
        row = cursor.fetchone()
        resp = get_task(row['id'])
        return (resp[0], 201)
    except Exception as e:
        return (str(e), 500)

# Get all tasks
def get_tasks():
    try:
        cursor.execute("SELECT id, title, date_format(created, '%Y-%m-%d %H:%i') as created FROM tasks")
        return (cursor.fetchall(), 200)
    except Exception as e:
        return (str(e), 500)

# Get an individual task
def get_task(id):
    try:
        cursor.execute("SELECT id, title, date_format(created, '%Y-%m-%d %H:%i') as created \
                                        FROM tasks WHERE id="+str(id))
        row = cursor.fetchone()
        return (row if row is not None else '', 200 if row is not None else 404)
    except Exception as e:
        return ('', 404)
        
# Update an existing task
def update_task(id, title):
    try:
        sql=""" UPDATE tasks SET title=%s WHERE id=%s """
        cursor.execute(sql, (title, id))
        db.commit()
        return get_task(id)
    except Exception as e:
        return (str(e), 500)
        
# Delete an existing task
def delete_task(id):
    try:
        resp = get_task(id)
        if resp[1] == 200:
            sql=""" DELETE FROM tasks WHERE id=%s """
            cursor.execute(sql, id)
            db.commit()
            return ('', 200)
        else:
            return resp
    except Exception as e:
        return (str(e), 500)

# Returns the HTTP request method
def get_method():
    return flask.request.method or 'GET'

# Returns the query string    
def get_query_string():
    query_string = flask.request.query_string.decode() or ''
    return query_string.replace('%20', ' ').replace('%2F', '/').replace('+', ' ')

# Returns the task ID if set in the request query string
def get_task_id():
    query_string = get_query_string()
    qs_parts = query_string.split('/')
    return qs_parts[0] if qs_parts[0].isnumeric() else None

# Returns the task title from the query string if set
def get_task_title():
    title = None
    query_string = get_query_string()
    if query_string != '':
        qs_parts = query_string.split('/')
        title = qs_parts[1] if len(qs_parts) > 1 else qs_parts[0]
        title = None if title.isnumeric() else title
    return title

# Returns True if title is valid, False otherwise
def title_is_valid(title):
    return True if isinstance(title, str) and len(title) >= 6 and len(title) <= 255 else False


# Entrypoint
@app.route('/', methods=['GET', 'POST', 'PUT', 'DELETE'])
def entrypoint():
    method = get_method()
    id = get_task_id()
    title = get_task_title()

    if method == 'GET' and not id is None:
        resp = get_task(id)
    elif method == 'GET':
        resp = get_tasks()
    elif method == 'DELETE':
        resp = delete_task(id)
    elif not title_is_valid(title):
        resp = ('', 400)
    elif method == 'POST':
        resp = create_task(title)
    elif method == 'PUT':
        resp = update_task(id, title)

    return(json.dumps(resp[0]), resp[1], {'Content-Type': 'application/json'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
EOF

nohup python3 /home/ec2-user/task_logger.py &