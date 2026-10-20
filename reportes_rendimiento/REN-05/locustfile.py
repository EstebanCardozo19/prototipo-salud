"""Carga HTTP de REN-05 para un único endpoint público de lectura por ejecución."""

import os

from locust import HttpUser, between, task


ENDPOINT = os.environ["REN05_ENDPOINT"]


class PublicReadOnlyUser(HttpUser):
    """Ejecuta sólo GET contra el endpoint seleccionado, con pacing controlado."""

    wait_time = between(0.1, 0.3)

    @task
    def get_public_profiles(self):
        with self.client.get(ENDPOINT, name=ENDPOINT, catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
            elif not isinstance(response.json(), list):
                response.failure("La respuesta no es una lista JSON")