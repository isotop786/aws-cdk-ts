#!/bin/bash
dnf update -y
dnf install -y mariadb105-server python3 python3-pip
systemctl start mariadb
systemctl enable mariadb
pip3 install flask pymysql

cat << EOF > /home/ec2-user/schema.sql
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('password');
CREATE DATABASE task_logger;
EOF
mysql </home/ec2-user/schema.sql

cat << EOF > /home/ec2-user/db_test.py
import pymysql
import os
from flask import Flask

# Database connection parameters - update as needed
DB_USER=os.getenv('DB_USER') or 'root'
DB_PSWD=os.getenv('DB_PSWD') or 'password'
DB_NAME=os.getenv('DB_NAME') or 'task_logger'
DB_HOST=os.getenv('DB_HOST') or '127.0.0.1'

app = Flask(__name__)

@app.route('/')
def test_db():
  db = pymysql.connect(host=DB_HOST, 
                       user=DB_USER, 
                       password=DB_PSWD, 
                       database=DB_NAME, 
                       cursorclass=pymysql.cursors.DictCursor)
  cursor = db.cursor()
  cursor.execute('SHOW DATABASES')
  return 'Setup Successful'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
EOF

nohup python3 /home/ec2-user/db_test.py &