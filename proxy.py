#!/usr/bin/env python3
"""
Simple proxy server to handle CORS issues with Mobivate API
This allows the frontend to make requests to the Mobivate API
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.parse
import json
import sys

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests to proxy to Mobivate API"""
        if self.path == '/send-sms':
            try:
                # Read the request body
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Parse the JSON data
                data = json.loads(post_data.decode('utf-8'))
                
                # Prepare the request to Mobivate API
                mobivate_url = 'https://api.mobivatebulksms.com/send/single'
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer v-c65a557c-f6e9-42b4-a092-628b4780538c:a288c95d-0867-4859-9eae-712d4d91f122'
                }
                
                print(f"Making request to: {mobivate_url}")
                print(f"Headers: {headers}")
                print(f"Data: {data}")
                
                # Create the request
                req = urllib.request.Request(
                    mobivate_url,
                    data=json.dumps(data).encode('utf-8'),
                    headers=headers,
                    method='POST'
                )
                
                # Make the request to Mobivate API
                try:
                    with urllib.request.urlopen(req) as response:
                        response_data = response.read()
                        response_json = json.loads(response_data.decode('utf-8'))
                        
                        # Send response back to client
                        self.send_response(200)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(response_json).encode('utf-8'))
                except urllib.error.HTTPError as e:
                    if e.code == 401:
                        # API key issue - return mock response for testing
                        mock_response = {
                            "status": "error",
                            "message": "API Key Issue - Please contact Mobivate support",
                            "details": "The API key is not working. This could be due to: 1) API key not activated, 2) Account issues, 3) API key expired, or 4) Incorrect format.",
                            "suggestion": "Please check your Mobivate dashboard or contact support to resolve the API key issue.",
                            "original_error": {"code": 401, "message": "Unauthorized"}
                        }
                        
                        self.send_response(200)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(mock_response).encode('utf-8'))
                    else:
                        raise e
                    
            except urllib.error.HTTPError as e:
                # Handle HTTP errors from Mobivate API
                error_data = e.read().decode('utf-8')
                try:
                    error_json = json.loads(error_data)
                except:
                    error_json = {'error': error_data}
                
                self.send_response(e.code)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(error_json).encode('utf-8'))
                
            except Exception as e:
                # Handle other errors
                error_response = {'error': str(e)}
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(error_response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """Override to reduce log noise"""
        pass

def run_server(port=8001):
    """Start the proxy server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, ProxyHandler)
    print(f"Proxy server running on port {port}")
    print(f"Access your SMS app at: http://localhost:8000")
    print(f"Proxy server at: http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down proxy server...")
        httpd.shutdown()

if __name__ == '__main__':
    port = 8001
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    run_server(port)
