from deployment import begin, is_draining, resume, snapshot


def test_deployment_gate_is_idempotent():
    resume()
    assert begin("maintenance") is True
    assert begin("maintenance") is False
    assert is_draining()
    assert snapshot()["message"] == "maintenance"
    resume()
    assert not is_draining()
