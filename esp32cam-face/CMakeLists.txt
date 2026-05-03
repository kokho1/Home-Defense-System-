cmake_minimum_required(VERSION 3.16)

# Pull in esp-who as a local component (cloned into components/)
set(EXTRA_COMPONENT_DIRS
    $ENV{IDF_PATH}/examples/common_components/protocol_examples_common
    ${CMAKE_CURRENT_SOURCE_DIR}/components/esp-who/components
)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32cam_face_unlock)
