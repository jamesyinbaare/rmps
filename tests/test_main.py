from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
def test_api_test():
    data = {"success": True}
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == data
