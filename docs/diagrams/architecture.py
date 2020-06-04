from diagrams import Cluster, Diagram, Edge
from diagrams.custom import Custom
from diagrams.aws.network import APIGateway
from diagrams.onprem.client import Users, Client
from diagrams.programming.framework import Vue, Django
from diagrams.aws.compute import Lambda
from diagrams.aws.engagement import Connect
from diagrams.aws.analytics import Kinesis
from diagrams.aws.database import Dynamodb
from pathlib import Path

ICONS = Path(__file__).parent / "icons"

graph_attrs = {
    "pad": "3.0",
}

with Diagram(
    "CC3 AWS Connect High Level Architecture",
    filename="architecture",
    outformat="svg",
    show=False,
    direction="BT",
    graph_attr=graph_attrs,
):
    connect = Connect("Connect")
    connectLambda = Lambda("awsConnect")
    web = Vue("CCU3 Web")
    api = Django("CCU3 Api")
    users = [Users("Users"), Users("Agents")]

    with Cluster("CCU3 awsconnect"):
        gateway = APIGateway("Websocket Gateway")
        database = Dynamodb("ConnectClientsDB")

        with Cluster("Websocket Handler"):

            with Cluster("Connection"):
                connectionHandlers = [Lambda("$connect" + str(i)) for i in range(3)]
                gateway - connectionHandlers
                connectionHandlers >> database

            with Cluster("Messaging"):
                wsHandlers = [Lambda("$default" + str(i)) for i in range(3)]
                gateway - wsHandlers
                wsHandlers - api
                wsHandlers >> database

            with Cluster("Dynamo Streams"):
                streams = [Lambda(i) for i in ["Agents", "Contacts", "Metrics"]]
                database >> streams >> gateway

    # Users -> Client <-> WebSocket
    client = Client("Client")
    client - Edge(style="dotted") - users
    client - web >> Edge() << gateway

    # Web <-> AWS Streams
    stE = dict(color="blue", style="bold")
    web >> Edge(**stE) << Kinesis("AWSConnectStreams") << Edge(**stE) << connect

    # Api -> Connect (Call Agent)
    api >> Edge(
        label="Agent\nConfirm\nPrompt", color="green", style="dashed"
    ) >> connect

    # Web <-> Api -> DynamoDB
    web >> Edge(color="firebrick", style="bold") << api >> Edge(
        color="firebrick", style="bold"
    ) >> database

    # Connect -> Integration -> ConnectDB
    cIn = dict(color="orange", style="bold")
    database << Edge(**cIn) << connectLambda >> Edge(**cIn) << connect

    # Inbound Contacts Trail
    contacts = Users("Inbound Contacts")
    ibE = dict(color="brown", style="bold")
    connect << Edge(**ibE) << contacts

    # Outbound Contacts Trail
    outbounds = Users("Outbound Contacts")
    obE = dict(color="green", style="bold")
    connect << web << Edge(**obE) << api << Edge(**obE) << outbounds
